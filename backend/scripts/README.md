# ZAI Platform — Operational Scripts

This folder hosts CLI utilities used to operate and quality-check the platform.

## eval_agent.py — Agent evaluation runner

Runs the `evals.json` test cases shipped with each agent under
`backend/app/skills/<slug>@*/evals.json` against the live `run_agent()`
pipeline and reports pass/fail, tokens used, and cost.

### Quick start

```bash
# from the backend/ directory
cd backend

# Run evals for one agent (human-readable output)
python -m scripts.eval_agent smm-content

# Run for every supported agent
python -m scripts.eval_agent --all

# Verbose mode prints a 200-char output preview per case
python -m scripts.eval_agent smm-content --verbose

# Machine-readable JSON report (suitable for CI)
python -m scripts.eval_agent smm-content --json

# Custom pass-rate threshold (default 0.90)
python -m scripts.eval_agent smm-content --threshold 0.8
```

The script exits with **0** when the overall pass rate is at or above the
threshold and **1** otherwise. If `AI_API_KEY` is not configured the script
prints a warning and exits **0** so CI doesn't break in offline mode.

### Sample output

```
🧪 Running evals for agent: smm-content
────────────────────────────────────────────────────────────
[1/8] ielts-discount           ✅ PASS  (847 tokens, $0.0024)
[2/8] beauty-promo             ✅ PASS  (912 tokens, $0.0026)
[3/8] restaurant-event         ❌ FAIL  expected_contains=['juma'] not found
...
────────────────────────────────────────────────────────────
Summary: 7/8 passed (87.5%)
Total tokens: 6,724
Total cost: $0.0193
```

### Test user

The script provisions a deterministic test user on first run:

- `telegram_id` = `9000000001` (well outside the real-user range)
- `is_admin = False`, `is_premium = False`
- `plan = "trial"`, `monthly_limit = 10000`, `used_count = 0`

This guarantees the runner doesn't trip over the limit checks inside
`run_agent()` while still exercising the same code path real users hit. The
helper is idempotent — repeated runs reuse the same row.

## `evals.json` schema

Each agent under `backend/app/skills/<slug>@<version>/evals.json` should look
like this:

```json
{
  "agent_slug": "smm-content",
  "evals": [
    {
      "name": "ielts-discount",
      "input": "Yangi guruhga qabul, 30% chegirma",
      "context_data": {
        "topic": "IELTS yangi guruh qabul",
        "platform": "Telegram",
        "tone": "Sotuvga yo'naltirilgan",
        "length": "O'rtacha",
        "business_type": "education"
      },
      "expected_contains": ["chegirma", "30%"],
      "expected_format": "## Variant",
      "expected_variants": 3,
      "max_tokens": 2200
    }
  ]
}
```

### Field reference

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Stable identifier — printed in the report. |
| `input` | string | The free-text prompt passed to `run_agent`. |
| `context_data` | object | Mirrors what the API endpoint would send (form fields). |
| `expected_contains` | string[] | All values must appear in the output (case-insensitive). |
| `expected_contains_any` | string[] | At least one value must appear (case-insensitive). Useful for refusal tests. |
| `expected_format` | string | Substring or regex that must match (case-insensitive). |
| `expected_variants` | int | Minimum number of `## Variant N` blocks the output must contain. |
| `max_tokens` | int | The case fails if `tokens_used` exceeds this number. |
| `is_security_test` | bool | Marks prompt-injection cases. The runner treats engine refusals as PASS. |

A case **passes** when none of the configured criteria report a problem. The
runner also handles two implicit signals:

- **Engine refusal on a security test** → PASS (the safety filter worked).
- **Engine refusal on a normal test** → FAIL with `agent_error: ...`.
- **Empty output** → FAIL with `empty output`.

### Adding new test cases

1. Pick a stable `name` (kebab-case — appears in CI logs).
2. Fill `context_data` with the same fields the agent's frontend form would
   submit. Look at `backend/app/skills/<slug>@<version>/schema.json` for the
   field list.
3. Choose pass criteria that test **what matters** — usually a few literal
   keywords plus a structural check (`expected_format` / `expected_variants`).
4. Set a reasonable `max_tokens` ceiling. The agent's `max_tokens_per_task`
   value is a sensible default.
5. Don't store API keys, real customer data, or PII inside `evals.json`.
6. Run `python -m scripts.eval_agent <slug>` locally before committing.

### CI integration sketch

```bash
cd backend
python -m scripts.eval_agent --all --json > eval-report.json
status=$?
# upload eval-report.json as a build artifact
exit $status
```

## smoke_test.py

End-to-end DB smoke test for the agent-purchase flow. Run with:

```bash
cd backend
python smoke_test.py
```
