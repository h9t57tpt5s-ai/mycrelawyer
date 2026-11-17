#!/usr/bin/env python3
"""Record the monthly accuracy audit's results (2026-11-16).

Input: .task-tmp/audit-results.json, written by the credocket-monthly-audit
task: {"month": "YYYY-MM", "results": [{"id", "verdict", "problems": [...],
"urlsOpened": [...]}, ...]}. Writes ops/audits/YYYY-MM.json with the
verdicts and problem descriptions (no source text). scripts/health_check.py
reports the latest month's failures in Jeff's daily email.

  python3 scripts/record_audit.py
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    data = json.loads((ROOT / ".task-tmp" / "audit-results.json").read_text())
    results = data["results"]
    failed = [r for r in results if r.get("verdict") != "pass"]
    out = {
        "month": data["month"],
        "checked": len(results),
        "failed": len(failed),
        "results": [{"id": r["id"], "verdict": r.get("verdict"), "problems": r.get("problems", []),
                     "urlsOpened": r.get("urlsOpened", [])} for r in results],
    }
    d = ROOT / "ops" / "audits"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{data['month']}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"{data['month']}: {len(failed)} of {len(results)} matters failed the audit.")


if __name__ == "__main__":
    main()
