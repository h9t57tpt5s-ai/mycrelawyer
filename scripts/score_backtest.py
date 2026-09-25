#!/usr/bin/env python3
"""Score Case Value Calculator backtest results (see the protocol in
case_valuation_project/backtest/README.md) and write the scored set to
js/backtest-results-data.js for the public calibration page.

  python3 scripts/score_backtest.py
"""

import glob
import json
import math
import re

RESULT_DIRS = {"v1": "case_valuation_project/backtest/results", "v2": "case_valuation_project/backtest/results-v2",
               "v3": "case_valuation_project/backtest/results-v3"}
# Chosen before the v2 revision was written; the revision was never tuned against them.
HOLDOUTS = {"island-girl-outfitters-v-allied-development-2025", "udot-boggess-draper-2025", "dover-mall-v-tang-2023", "nco-montgomery-park-2025", "edgemere-lawal-2025", "navient-v-bpg-office-partners-2023"}
OUT = "js/backtest-results-data.js"
# Only counsel-fee claims are set aside; "late fees" inside a rent claim stay.
FEE_LABEL = re.compile(r"attorney|counsel|legal fees", re.I)


def ex_fee_range(issues):
    """Per-issue range excluding counsel-fee issues, mirroring the live
    function: v1 issues (no claimant field) sum probability x damages; v2
    issues run from the weighted low to the supported ceiling, with
    opposing issues carried as negative exposure and netted."""
    lo = hi = 0.0
    used = 0
    for i in issues:
        if FEE_LABEL.search(i.get("label") or ""):
            continue
        p, d = i.get("probabilityRange"), i.get("damagesRange")
        if not p or not d:
            continue
        used += 1
        if i.get("claimant") == "opposing":
            lo += p[1] * d[0]
            # the supported upside is that the opposing claim fails: adds 0
        elif i.get("claimant") == "represented":
            lo += p[0] * d[0]
            hi += i["supportedCeiling"] if isinstance(i.get("supportedCeiling"), (int, float)) else d[1]
        else:
            lo += p[0] * d[0]
            hi += p[1] * d[1]
    # Floor/ceil, not round: a ceiling of $170,484.37 must contain an award of $170,484.37.
    return ([math.floor(lo), math.ceil(hi)] if used else None), used


def ex_fee_best(issues, version):
    """Best guess excluding counsel-fee issues, with each version's own
    formula: v1 p_mid x d_mid; v2 the midpoint of each issue's weighted
    range; v3 p_mid x d_high for the represented side, p_mid x d_mid for
    the opposing side."""
    total, used = 0.0, 0
    for i in issues:
        if FEE_LABEL.search(i.get("label") or ""):
            continue
        p, d = i.get("probabilityRange"), i.get("damagesRange")
        if not p or not d:
            continue
        used += 1
        pm, dm = (p[0] + p[1]) / 2, (d[0] + d[1]) / 2
        opp = i.get("claimant") == "opposing"
        if version == "v3":
            total += pm * dm if opp else pm * d[1]
        elif version == "v2" and i.get("claimant"):
            total += ((p[1] * d[0] + p[0] * d[1]) if opp else (p[0] * d[0] + p[1] * d[1])) / 2
        else:
            total += pm * dm
    return total if used else None


def score(record):
    p = record.get("prediction") or {}
    o = record["outcome"]
    main_award = o.get("amount")
    fees = o.get("attorneysFeesAtTrial") or 0
    all_in_actual = (main_award or 0) + fees if main_award is not None else None
    top = p.get("damagesRange")
    best = p.get("bestGuessValue")
    exf, used = ex_fee_range(p.get("issues") or [])
    # A voided result (e.g. run for the wrong side) is excluded like an error.
    void = record.get("void")
    declined = record.get("status") == 200 and not top and not void

    def inside(rng, x):
        return None if not rng or x is None else (rng[0] <= x <= rng[1])

    def err(pred, x):
        return None if pred is None or not x else round((pred - x) / x, 3)

    final_amount = o.get("finalAmount")
    version = p.get("analysisVersion") or "v1"
    best_ex = ex_fee_best(p.get("issues") or [], version) if exf else None
    final_hit = inside(exf, final_amount)
    trial_hit = inside(exf, main_award)
    return {
        "id": record["id"],
        # Primary score: what the case was ultimately worth after appeal.
        # Null when the appellate court sent it back with no figure yet.
        "final": {"predictedRange": exf, "actual": final_amount, "hit": final_hit, "note": o.get("finalNote"),
                  "bestGuess": best_ex, "bestGuessError": err(best_ex, final_amount),
                  "correctedTowardPrediction": bool(final_hit) and trial_hit is False,
                  "pending": final_amount is None and not declined},
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
        "error": record.get("error") or ({"void": void} if void else None),
        "void": void,
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
        "finalHits": sum(1 for r in scored if r["final"]["hit"]),
        "finalScorable": sum(1 for r in scored if r["final"]["hit"] is not None),
        "finalPending": sum(1 for r in scored if r["final"]["pending"]),
        "correctedOnAppeal": sum(1 for r in scored if r["final"]["correctedTowardPrediction"]),
        "holdoutHits": sum(1 for r in scored if r["holdout"] and r["final"]["hit"]),
        "holdoutScorable": sum(1 for r in scored if r["holdout"] and r["final"]["hit"] is not None),
    }
    ferrs = sorted(r["final"]["bestGuessError"] for r in scored if r["final"]["bestGuessError"] is not None)
    summary["finalBestGuessMedianError"] = ferrs[len(ferrs) // 2] if ferrs else None
    summary["finalBestGuessWithin25"] = sum(1 for e in ferrs if abs(e) <= 0.25)
    summary["finalBestGuessScorable"] = len(ferrs)
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
        f.write("/* Generated by scripts/score_backtest.py from the case_valuation_project/backtest results directories. Do not edit. */\n")
        f.write("window.BACKTEST_RESULTS = " + json.dumps(payload, indent=1) + ";\n")
    for v, data in versions.items():
        print(v, json.dumps(data["summary"]))
        for r in data["cases"]:
            print(f"  {'H ' if r['holdout'] else '  '}{r['id']}: range {r['exFees']['predictedRange']} | final {r['final']['actual']} -> {r['final']['hit']}{' (corrected on appeal)' if r['final']['correctedTowardPrediction'] else ''} | trial {r['exFees']['actual']} -> {r['exFees']['hit']}")


if __name__ == "__main__":
    main()
