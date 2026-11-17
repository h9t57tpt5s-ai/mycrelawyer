#!/usr/bin/env python3
"""Pick the monthly accuracy-audit sample (2026-11-16).

Ten published matters: five added in the last 30 days (the newest work,
which should all have passed the verification gate) and five from the
whole archive. The pick is seeded by the month, so a re-run of the same
month picks the same matters. Writes .task-tmp/audit-sample.json for the
credocket-monthly-audit scheduled task, which sends each matter to an
independent fact-checker (ops/fact-check-brief.md) and records the
results with scripts/record_audit.py.

  python3 scripts/sample_audit.py [YYYY-MM]
"""

import datetime as dt
import json
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_case_fields import load_cases  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
KEEP = ("id", "title", "brief", "summary", "significance", "body", "timeline", "parties", "date", "status", "jurisdiction",
        "judge", "amount", "amountUsd", "sourceUrl", "docketUrl", "seoTitle", "seoDescription", "addedDate")


def main():
    month = sys.argv[1] if len(sys.argv) > 1 else dt.date.today().strftime("%Y-%m")
    rng = random.Random(month)
    cases = sorted(load_cases(), key=lambda c: c["id"])
    cutoff = (dt.date.today() - dt.timedelta(days=30)).isoformat()
    recent = [c for c in cases if (c.get("addedDate") or "") >= cutoff]
    picks = rng.sample(recent, min(5, len(recent)))
    rest = [c for c in cases if c not in picks]
    picks += rng.sample(rest, 10 - len(picks))
    out = ROOT / ".task-tmp" / "audit-sample.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"month": month, "matters": [{k: c.get(k) for k in KEEP if k in c} for c in picks]}, indent=1, ensure_ascii=False))
    print(f"{month}: {len(picks)} matters -> {out.relative_to(ROOT)}: " + ", ".join(c["id"] for c in picks))


if __name__ == "__main__":
    main()
