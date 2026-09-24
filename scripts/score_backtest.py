#!/usr/bin/env python3
"""Score Case Value Calculator backtest results (see the protocol in
case_valuation_project/backtest/README.md) and write the scored set to
js/backtest-results-data.js for the public calibration page.

  python3 scripts/score_backtest.py
"""

import glob
import json
import re

RESULT_DIRS = {"v1": "case_valuation_project/backtest/results", "v2": "case_valuation_project/backtest/results-v2"}
# Chosen before the v2 revision was written; the revision was never tuned against them.
HOLDOUTS = {"island-girl-outfitters-v-allied-development-2025", "udot-boggess-draper-2025", "dover-mall-v-tang-2023", "nco-montgomery-park-2025", "edgemere-lawal-2025", "navient-v-bpg-office-partners-2023"}
OUT = "js/backtest-results-data.js"
# Only counsel-fee claims are set aside; "late fees" inside a rent claim stay.
FEE_LABEL = re.compile(r"attorney|counsel|legal fees", re.I)


def ex_fee_range(issues):
    lo = hi = 0.0
    used = 0
    for i in issues:
        if FEE_LABEL.search(i.get("label") or ""):
            continue
        p, d = i.get("probabilityRange"), i.get("damagesRange")
        if not p or not d:
            continue
        lo += p[0] * d[0]
        hi += p[1] * d[1]
        used += 1
    return ([round(lo), round(hi)] if used else None), used


def score(record):
    p = record.get("prediction") or {}
    o = record["outcome"]
    main_award = o.get("amount")
    fees = o.get("attorneysFeesAtTrial") or 0
    all_in_actual = (main_award or 0) + fees if main_award is not None else None
    top = p.get("damagesRange")
    best = p.get("bestGuessValue")
    exf, used = ex_fee_range(p.get("issues") or [])
    declined = record.get("status") == 200 and not top

    def inside(rng, x):
        return None if not rng or x is None else (rng[0] <= x <= rng[1])

    def err(pred, x):
        return None if pred is None or not x else round((pred - x) / x, 3)

    return {
        "id": record["id"],
        "caseName": (record.get("source") or {}).get("caseName"),
        "court": (record.get("source") or {}).get("court"),
        "decided": (record.get("source") or {}).get("decided"),
        "sourceUrl": (record.get("source") or {}).get("url"),
        "ranAt": record.get("ranAt"),
        "model": p.get("model") or ("claude-opus-5" if record.get("status") == 200 else None),
        "analysisVersion": p.get("analysisVersion") or "v1",
        "holdout": record["id"] in HOLDOUTS,
        "category": p.get("category"),
        "role": p.get("roleLabel"),
        "declined": declined,
        "error": record.get("error"),
        "exFees": {"predictedRange": exf, "issuesUsed": used, "actual": main_award, "hit": inside(exf, main_award)},
        "allIn": {
            "predictedRange": top, "bestGuess": best, "actual": all_in_actual,
            "hit": inside(top, all_in_actual), "bestGuessError": err(best, all_in_actual),
        },
        "outcomeDescription": o.get("description"),
        "appellateChange": o.get("appellateChange"),
    }


def summarize(rows):
    scored = [r for r in rows if not r["declined"] and not r["error"]]
    summary = {
        "cases": len(rows), "scored": len(scored),
        "declined": sum(1 for r in rows if r["declined"]), "errors": sum(1 for r in rows if r["error"]),
        "exFeesHits": sum(1 for r in scored if r["exFees"]["hit"]),
        "exFeesScorable": sum(1 for r in scored if r["exFees"]["hit"] is not None),
        "allInHits": sum(1 for r in scored if r["allIn"]["hit"]),
        "allInScorable": sum(1 for r in scored if r["allIn"]["hit"] is not None),
        "medianBestGuessError": None,
        "holdoutHits": sum(1 for r in scored if r["holdout"] and r["exFees"]["hit"]),
        "holdoutScorable": sum(1 for r in scored if r["holdout"] and r["exFees"]["hit"] is not None),
    }
    errs = sorted(r["allIn"]["bestGuessError"] for r in scored if r["allIn"]["bestGuessError"] is not None)
    if errs:
        summary["medianBestGuessError"] = errs[len(errs) // 2]
    pairs = [((r["exFees"]["predictedRange"][0] + r["exFees"]["predictedRange"][1]) / 2, r["exFees"]["actual"])
             for r in scored if r["exFees"]["predictedRange"] and r["exFees"]["actual"]]
    ratios = sorted(a / b for a, b in pairs if b)
    summary["medianCaseRatio"] = round(ratios[len(ratios) // 2], 3) if ratios else None
    summary["aggregatePredicted"] = round(sum(a for a, _ in pairs))
    summary["aggregateActual"] = round(sum(b for _, b in pairs))
    summary["aggregateRatio"] = round(summary["aggregatePredicted"] / summary["aggregateActual"], 3) if summary["aggregateActual"] else None
    return summary


def main():
    versions = {}
    for v, d in RESULT_DIRS.items():
        rows = [score(json.load(open(f))) for f in sorted(glob.glob(d + "/*.json"))]
        if rows:
            versions[v] = {"summary": summarize(rows), "cases": rows}
    payload = {
        "generatedAt": max((r["ranAt"] or "") for v in versions.values() for r in v["cases"]) if versions else None,
        "versions": versions,
        # Kept for the page's original fields: the newest version with results.
        "summary": versions[max(versions)]["summary"] if versions else {},
        "cases": versions[max(versions)]["cases"] if versions else [],
    }
    with open(OUT, "w") as f:
        f.write("/* Generated by scripts/score_backtest.py from case_valuation_project/backtest/results*/. Do not edit. */\n")
        f.write("window.BACKTEST_RESULTS = " + json.dumps(payload, indent=1) + ";\n")
    for v, data in versions.items():
        print(v, json.dumps(data["summary"]))
        for r in data["cases"]:
            print(f"  {'H ' if r['holdout'] else '  '}{r['id']}: ex-fees {r['exFees']['predictedRange']} vs {r['exFees']['actual']} -> {r['exFees']['hit']}")


if __name__ == "__main__":
    main()
