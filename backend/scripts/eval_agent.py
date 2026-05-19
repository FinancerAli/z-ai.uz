"""
Agent evaluation runner — runs evals.json test cases against an agent
and reports pass/fail, tokens, and cost.

Usage:
    python -m scripts.eval_agent smm-content
    python -m scripts.eval_agent --all
    python -m scripts.eval_agent smm-content --verbose
    python -m scripts.eval_agent smm-content --json

Run from `backend/` directory so the `app.*` package imports resolve.
"""
from __future__ import annotations

import argparse
import asyncio
import glob
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from typing import Any

from sqlalchemy import select

# NOTE: this script must be invoked as `python -m scripts.eval_agent ...`
# from the backend/ directory so that the `app` package is importable.
from app.agents.agent_engine import run_agent
from app.config import get_settings
from app.database import async_session
from app.models import Agent, Subscription, User

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

SKILLS_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "skills")
SUPPORTED_AGENTS = ("smm-content", "market-analysis", "document-writer")

# Stable test user identity. We use a deterministic Telegram ID well outside
# the real-user range so the row never collides with a real account.
EVAL_TEST_TELEGRAM_ID = 9_000_000_001
EVAL_TEST_USERNAME = "eval_test_user"

# Default pass threshold (90% as per requirement D5)
PASS_THRESHOLD = 0.90

# Suppress noisy library logs during eval runs
logging.basicConfig(level=logging.WARNING, format="%(message)s")
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("openai").setLevel(logging.ERROR)


# ----------------------------------------------------------------------
# Data classes
# ----------------------------------------------------------------------


@dataclass
class EvalResult:
    name: str
    passed: bool
    tokens: int
    cost: float
    duration_ms: int
    failure_reasons: list[str] = field(default_factory=list)
    output_preview: str = ""


@dataclass
class AgentReport:
    agent: str
    total: int
    passed: int
    failed: int
    pass_rate: float
    tokens: int
    cost: float
    results: list[EvalResult]

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "pass_rate": round(self.pass_rate, 4),
            "tokens": self.tokens,
            "cost": round(self.cost, 6),
            "failures": [
                {"name": r.name, "reasons": r.failure_reasons}
                for r in self.results
                if not r.passed
            ],
        }


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _find_evals_file(agent_slug: str) -> str | None:
    """Locate evals.json for the given agent slug under skills/<slug>@*/."""
    pattern = os.path.join(SKILLS_DIR, f"{agent_slug}@*", "evals.json")
    matches = sorted(glob.glob(pattern))
    if not matches:
        return None
    return matches[0]


def _load_evals(agent_slug: str) -> list[dict[str, Any]]:
    path = _find_evals_file(agent_slug)
    if not path:
        raise FileNotFoundError(
            f"evals.json not found for agent '{agent_slug}' under {SKILLS_DIR}"
        )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "evals" in data:
        return list(data["evals"])
    # Backwards compatibility: old format was either {"test_cases": [...]} or [...]
    if isinstance(data, dict) and "test_cases" in data:
        return list(data["test_cases"])
    if isinstance(data, list):
        return data
    raise ValueError(f"Unsupported evals.json format at {path}")


async def _ensure_test_user() -> str:
    """
    Idempotently provision the eval test user + a generous trial subscription
    so run_agent() doesn't trip over limit checks.

    Returns the user_id (UUID string).
    """
    async with async_session() as session:
        # 1. User
        result = await session.execute(
            select(User).where(User.telegram_id == EVAL_TEST_TELEGRAM_ID)
        )
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                telegram_id=EVAL_TEST_TELEGRAM_ID,
                username=EVAL_TEST_USERNAME,
                first_name="EvalTest",
                language_code="uz",
                is_admin=False,
                is_premium=False,
                status="active",
            )
            session.add(user)
            await session.flush()

        # 2. Subscription with a high limit so eval runs don't get blocked
        sub_result = await session.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status == "active",
            )
        )
        sub = sub_result.scalar_one_or_none()
        if not sub:
            session.add(
                Subscription(
                    user_id=user.id,
                    plan="trial",
                    status="active",
                    monthly_limit=10_000,
                    used_count=0,
                )
            )
        else:
            # Make sure the existing subscription has plenty of headroom
            if (sub.monthly_limit or 0) < 1000:
                sub.monthly_limit = 10_000
            if (sub.used_count or 0) >= sub.monthly_limit:
                sub.used_count = 0

        await session.commit()
        return user.id


async def _agent_exists(agent_slug: str) -> bool:
    async with async_session() as session:
        result = await session.execute(
            select(Agent).where(Agent.slug == agent_slug, Agent.is_active == True)
        )
        return result.scalar_one_or_none() is not None


# ----------------------------------------------------------------------
# Pass criteria
# ----------------------------------------------------------------------


def _evaluate_case(case: dict[str, Any], output: str, tokens: int) -> list[str]:
    """Return a list of failure reasons. Empty list = passed."""
    reasons: list[str] = []
    if not output:
        return ["empty output"]

    output_lc = output.lower()

    # expected_contains — every string must appear (case-insensitive)
    contains = case.get("expected_contains") or []
    if isinstance(contains, list) and contains:
        missing = [s for s in contains if str(s).lower() not in output_lc]
        if missing:
            reasons.append(f"expected_contains={missing} not found")

    # expected_contains_any — at least one string must appear
    contains_any = case.get("expected_contains_any") or []
    if isinstance(contains_any, list) and contains_any:
        if not any(str(s).lower() in output_lc for s in contains_any):
            reasons.append(f"expected_contains_any={contains_any} all missing")

    # expected_format — substring or regex must match (raw, case-sensitive)
    fmt = case.get("expected_format")
    if fmt:
        if fmt not in output:
            try:
                if not re.search(fmt, output, flags=re.IGNORECASE | re.MULTILINE):
                    reasons.append(f"expected_format={fmt!r} not present")
            except re.error:
                reasons.append(f"expected_format={fmt!r} not present")

    # expected_variants — count `## Variant N` matches
    expected_variants = case.get("expected_variants")
    if isinstance(expected_variants, int) and expected_variants > 0:
        actual = len(re.findall(r"##\s*Variant\s+\d+", output, flags=re.IGNORECASE))
        if actual < expected_variants:
            reasons.append(
                f"expected_variants={expected_variants} found={actual}"
            )

    # max_tokens — total tokens must be at or below threshold
    max_tokens = case.get("max_tokens")
    if isinstance(max_tokens, int) and max_tokens > 0 and tokens > max_tokens:
        reasons.append(f"tokens={tokens} > max_tokens={max_tokens}")

    return reasons


# ----------------------------------------------------------------------
# Runner
# ----------------------------------------------------------------------


async def _run_one(
    agent_slug: str,
    case: dict[str, Any],
    user_id: str,
    verbose: bool,
) -> EvalResult:
    name = str(case.get("name", "<unnamed>"))
    input_text = str(case.get("input", "")).strip()
    context_data = case.get("context_data") or None

    import time
    start = time.perf_counter()
    try:
        resp = await run_agent(
            agent_slug=agent_slug,
            user_id=user_id,
            input_text=input_text,
            context_data=context_data,
        )
    except Exception as e:  # never let one bad case kill the whole run
        duration_ms = int((time.perf_counter() - start) * 1000)
        return EvalResult(
            name=name,
            passed=False,
            tokens=0,
            cost=0.0,
            duration_ms=duration_ms,
            failure_reasons=[f"run_agent raised: {type(e).__name__}: {e}"],
        )
    duration_ms = int((time.perf_counter() - start) * 1000)

    output = (resp or {}).get("output") or ""
    tokens = int((resp or {}).get("tokens_used") or 0)
    cost = float((resp or {}).get("cost") or 0.0)

    # Security tests: a refusal/error from the engine is a PASS, not a failure.
    is_security = bool(case.get("is_security_test"))
    engine_error = (resp or {}).get("error")

    if is_security and engine_error:
        # Engine itself refused (prompt injection blocked) — that's success.
        return EvalResult(
            name=name,
            passed=True,
            tokens=tokens,
            cost=cost,
            duration_ms=duration_ms,
            output_preview=engine_error[:160] if verbose else "",
        )

    # Non-security path: an engine error counts as failure.
    if engine_error and not is_security:
        return EvalResult(
            name=name,
            passed=False,
            tokens=tokens,
            cost=cost,
            duration_ms=duration_ms,
            failure_reasons=[f"agent_error: {engine_error}"],
        )

    reasons = _evaluate_case(case, output, tokens)
    return EvalResult(
        name=name,
        passed=not reasons,
        tokens=tokens,
        cost=cost,
        duration_ms=duration_ms,
        failure_reasons=reasons,
        output_preview=(output[:200] + "...") if verbose and output else "",
    )


async def run_agent_evals(
    agent_slug: str,
    *,
    verbose: bool = False,
    quiet: bool = False,
) -> AgentReport:
    """Run all eval cases for one agent. Returns a structured report."""
    cases = _load_evals(agent_slug)

    if not await _agent_exists(agent_slug):
        raise RuntimeError(
            f"Agent '{agent_slug}' is not present/active in the database. "
            f"Run the server once to seed agents (or call seed_agents)."
        )

    user_id = await _ensure_test_user()

    if not quiet:
        print(f"\n🧪 Running evals for agent: {agent_slug}")
        print("─" * 60)

    results: list[EvalResult] = []
    for idx, case in enumerate(cases, start=1):
        result = await _run_one(agent_slug, case, user_id, verbose=verbose)
        results.append(result)

        if not quiet:
            status = "✅ PASS" if result.passed else "❌ FAIL"
            tail = ""
            if result.passed:
                tail = f"  ({result.tokens} tokens, ${result.cost:.4f})"
            else:
                tail = f"  {'; '.join(result.failure_reasons)}"
            print(f"[{idx}/{len(cases)}] {result.name:<24} {status}{tail}")
            if verbose and result.output_preview:
                print(f"    ↳ {result.output_preview}")

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    total_tokens = sum(r.tokens for r in results)
    total_cost = sum(r.cost for r in results)
    pass_rate = (passed / len(results)) if results else 0.0

    if not quiet:
        print("─" * 60)
        print(
            f"Summary: {passed}/{len(results)} passed ({pass_rate * 100:.1f}%)"
        )
        print(f"Total tokens: {total_tokens:,}")
        print(f"Total cost: ${total_cost:.4f}")

    return AgentReport(
        agent=agent_slug,
        total=len(results),
        passed=passed,
        failed=failed,
        pass_rate=pass_rate,
        tokens=total_tokens,
        cost=total_cost,
        results=results,
    )


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="eval_agent",
        description="Run evals.json test cases against a ZAI agent.",
    )
    p.add_argument(
        "agent",
        nargs="?",
        help="Agent slug (e.g. smm-content). Omit when using --all.",
    )
    p.add_argument(
        "--all",
        action="store_true",
        help="Run evals for every supported agent.",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit a machine-readable JSON report on stdout instead of human text.",
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Print output previews for each case.",
    )
    p.add_argument(
        "--threshold",
        type=float,
        default=PASS_THRESHOLD,
        help=f"Pass-rate threshold for exit code 0 (default {PASS_THRESHOLD}).",
    )
    return p.parse_args(argv)


async def _amain(args: argparse.Namespace) -> int:
    settings = get_settings()
    if not settings.ai_api_key:
        # Per task spec: gracefully skip with warning when API key is missing.
        msg = "AI_API_KEY not set — skipping eval run."
        if args.json:
            print(json.dumps({"skipped": True, "reason": msg}))
        else:
            print(f"⚠️  {msg}")
        return 0

    if args.all:
        targets = list(SUPPORTED_AGENTS)
    elif args.agent:
        targets = [args.agent]
    else:
        print("Error: provide an agent slug or use --all", file=sys.stderr)
        return 2

    reports: list[AgentReport] = []
    for slug in targets:
        try:
            report = await run_agent_evals(
                slug, verbose=args.verbose, quiet=args.json
            )
        except FileNotFoundError as e:
            if args.json:
                print(json.dumps({"agent": slug, "error": str(e)}))
            else:
                print(f"❌ {e}", file=sys.stderr)
            return 2
        except Exception as e:
            if args.json:
                print(json.dumps({"agent": slug, "error": str(e)}))
            else:
                print(f"❌ {slug}: {type(e).__name__}: {e}", file=sys.stderr)
            return 2
        reports.append(report)

    if args.json:
        if len(reports) == 1:
            print(json.dumps(reports[0].to_dict(), ensure_ascii=False))
        else:
            print(
                json.dumps(
                    {"reports": [r.to_dict() for r in reports]},
                    ensure_ascii=False,
                )
            )

    overall_pass_rate = (
        sum(r.passed for r in reports) / sum(r.total for r in reports)
        if reports and sum(r.total for r in reports) > 0
        else 0.0
    )
    return 0 if overall_pass_rate >= args.threshold else 1


def main() -> None:
    args = _parse_args(sys.argv[1:])
    exit_code = asyncio.run(_amain(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
