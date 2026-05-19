"""Quick sanity tests for the pass-criteria logic in eval_agent.py.

Run with:
    python -m scripts._test_eval_logic
"""
from scripts.eval_agent import _evaluate_case


def t(label: str, case: dict, output: str, tokens: int, expected_pass: bool, expected_substring: str = ""):
    reasons = _evaluate_case(case, output, tokens)
    actual_pass = not reasons
    status = "OK" if actual_pass == expected_pass else "FAIL"
    extra = ""
    if expected_substring:
        joined = "; ".join(reasons)
        if expected_substring not in joined:
            status = "FAIL"
            extra = f" (expected reason '{expected_substring}', got '{joined}')"
    print(f"[{status}] {label}: pass={actual_pass} reasons={reasons}{extra}")
    return status == "OK"


def main() -> None:
    ok = []

    # 1. expected_contains all present, case-insensitive
    ok.append(t(
        "contains_all_present",
        {"expected_contains": ["chegirma", "30%"]},
        "Bizda CHEGIRMA 30% bor",
        100,
        True,
    ))

    # 2. expected_contains missing one
    ok.append(t(
        "contains_missing",
        {"expected_contains": ["chegirma", "50%"]},
        "Chegirma 30% bor",
        100,
        False,
        expected_substring="50%",
    ))

    # 3. expected_format substring
    ok.append(t(
        "format_substring_present",
        {"expected_format": "## Variant"},
        "## Variant 1 — Asosiy\nMatn",
        100,
        True,
    ))

    # 4. expected_format regex
    ok.append(t(
        "format_regex_present",
        {"expected_format": r"^##\s*Variant"},
        "## Variant 1 — Asosiy\nMatn",
        100,
        True,
    ))

    # 5. expected_format missing
    ok.append(t(
        "format_missing",
        {"expected_format": "## Variant"},
        "Just plain text",
        100,
        False,
        expected_substring="expected_format",
    ))

    # 6. expected_variants — three present
    ok.append(t(
        "variants_three",
        {"expected_variants": 3},
        "## Variant 1 — Asosiy\n...\n## Variant 2 — Trend\n...\n## Variant 3 — Qisqa\n...",
        100,
        True,
    ))

    # 7. expected_variants — only two present
    ok.append(t(
        "variants_short",
        {"expected_variants": 3},
        "## Variant 1\n## Variant 2",
        100,
        False,
        expected_substring="expected_variants=3",
    ))

    # 8. max_tokens exceeded
    ok.append(t(
        "tokens_over",
        {"max_tokens": 100},
        "Some output",
        500,
        False,
        expected_substring="tokens=500",
    ))

    # 9. max_tokens fine
    ok.append(t(
        "tokens_under",
        {"max_tokens": 1000},
        "Some output",
        500,
        True,
    ))

    # 10. expected_contains_any — at least one present
    ok.append(t(
        "contains_any_present",
        {"expected_contains_any": ["bloklandi", "rad et"]},
        "Ushbu so'rov BLOKLANDI",
        100,
        True,
    ))

    # 11. expected_contains_any — all missing
    ok.append(t(
        "contains_any_missing",
        {"expected_contains_any": ["bloklandi", "rad et"]},
        "Boshqa matn",
        100,
        False,
        expected_substring="expected_contains_any",
    ))

    # 12. Empty output — fail
    ok.append(t(
        "empty_output",
        {"expected_contains": ["any"]},
        "",
        0,
        False,
        expected_substring="empty output",
    ))

    print()
    print(f"Passed: {sum(ok)}/{len(ok)}")
    if not all(ok):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
