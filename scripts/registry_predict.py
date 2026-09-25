#!/usr/bin/env python3
"""Log dated Case Value Calculator predictions on PENDING matters.

Input: case_valuation_project/registry/pending-cases.json, one entry per
matter with the calculator input built from BOTH sides' public filings
(the site's rule: never value a case from one party's filing alone).
Output: an entry appended to case_valuation_project/registry/entries.json
and js/prediction-registry-data.js regenerated from it. The commit that
follows is the timestamp; entries are never edited after the fact, and a
matter is never re-run once it has an entry.

  AUTOMATION_SECRET=... python3 scripts/registry_predict.py --limit 1 --confirm
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backtest_case_valuation import call_calculator  # noqa: E402

PENDING = pathlib.Path("case_valuation_project/registry/pending-cases.json")
ENTRIES = pathlib.Path("case_valuation_project/registry/entries.json")
JS_OUT = pathlib.Path("js/prediction-registry-data.js")


def render_js():
    entries = json.loads(ENTRIES.read_text()) if ENTRIES.exists() else []
    src = JS_OUT.read_text()
    head = src[: src.index("const PREDICTION_REGISTRY = [")]
    body = json.dumps(entries, indent=2)
    JS_OUT.write_text(head + "const PREDICTION_REGISTRY = " + body + ";\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--confirm", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    secret = os.environ.get("AUTOMATION_SECRET", "").strip()
    if not secret:
        sys.exit("AUTOMATION_SECRET is required.")
    if not args.confirm:
        sys.exit("Refusing to run without --confirm: every matter is a real Claude API call.")

    pending = json.loads(PENDING.read_text())
    entries = json.loads(ENTRIES.read_text()) if ENTRIES.exists() else []
    done = {e["registryId"] for e in entries}
    wanted = set(filter(None, args.only.split(",")))
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()

    ran = 0
    for m in pending:
        if m["id"] in done or (wanted and m["id"] not in wanted):
            continue
        if ran >= args.limit:
            break
        for key in ("caseTitle", "court", "filings", "input"):
            if key not in m:
                sys.exit(f"{m['id']}: missing {key}")
        if len(m["filings"]) < 2 or len({f["side"] for f in m["filings"]}) < 2:
            sys.exit(f"{m['id']}: needs public filings from both sides")
        print(f"running {m['id']} ...", flush=True)
        status, body = call_calculator(secret, m["input"])
        if status != 200:
            print(f"  HTTP {status}: {body}")
            continue
        a = body.get("analysis", {})
        # sideA/sideB are fixed per category, so a wrong userSide values the
        # other party. Never log a prediction for the wrong client.
        if m.get("expectedRole") and a.get("roleLabel") != m["expectedRole"]:
            print(f"  REFUSED: valued as {a.get('roleLabel')!r}, but the client is the {m['expectedRole']!r}; fix userSide")
            continue
        entries.append({
            "registryId": m["id"],
            "caseId": m.get("trackerCaseId"),
            "caseTitle": m["caseTitle"],
            "court": m["court"],
            "docket": m.get("docket"),
            "filings": m["filings"],
            "predictedAt": today,
            "model": a.get("model"),
            "analysisVersion": a.get("analysisVersion") or "v1",
            "category": a.get("category"),
            "side": a.get("roleLabel"),
            "predictedRange": a.get("damagesRange"),
            "predictedBestGuess": a.get("bestGuessValue"),
            "whatIsNeededForEstimate": a.get("whatIsNeededForEstimate"),
            "likelyOutcome": a.get("likelyOutcome"),
            "claims": [
                {"label": i.get("label"), "probabilityRange": i.get("probabilityRange"), "damagesRange": i.get("damagesRange")}
                for i in a.get("issues", [])
            ],
            "status": "pending",
            "actualOutcome": None,
            "resolvedAt": None,
            "analysis": None,
        })
        ENTRIES.write_text(json.dumps(entries, indent=2))
        render_js()
        ran += 1
        print(f"  {a.get('category')} | {a.get('roleLabel')} | range {a.get('damagesRange')} | best {a.get('bestGuessValue')}")
        time.sleep(3)
    print(f"done: {ran} prediction(s) logged")


if __name__ == "__main__":
    main()
