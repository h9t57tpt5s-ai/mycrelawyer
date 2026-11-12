#!/usr/bin/env python3
"""Summarize the opinion outcome database (scripts/extract_opinion_outcomes.ts).

Counts only verified figures. Writes summary.json beside the outcomes file;
both stay in the gitignored research folder.

  python3 scripts/summarize_opinion_outcomes.py OUTCOMES.jsonl [PREPARED.jsonl.gz]
"""
import collections
import gzip
import json
import os
import statistics
import sys


def main(path, prepared=None):
    meta = {}
    if prepared:
        with gzip.open(prepared, "rt") as f:
            for line in f:
                c = json.loads(line)
                meta[c["id"]] = {k: c.get(k) for k in ("date_filed", "court", "jurisdiction")}
    rows = [json.loads(l) for l in open(path) if l.strip()]
    ok = [r for r in rows if r.get("extraction")]
    cost = sum(r.get("cost", 0) for r in rows)
    cre = [r for r in ok if r["extraction"]["is_commercial_real_estate"]
           and not r["extraction"]["residential_or_consumer"] and not r["extraction"]["debt_collection"]]
    usable = [r for r in cre if r["extraction"]["usable_for_calibration"]]

    by_cat = collections.defaultdict(lambda: {"cases": 0, "usable": 0, "claims_decided": 0, "claimant_won": 0,
                                              "award_to_claim": [], "appeals": 0, "affirmed": 0, "awards": []})
    by_state = collections.Counter()
    for r in cre:
        x = r["extraction"]
        b = by_cat[x["category"]]
        b["cases"] += 1
        b["usable"] += x["usable_for_calibration"]
        by_state[x["state"] or "?"] += 1
        for c in x["claims"]:
            if c["trial_result"] in ("won", "partly-won", "lost"):
                b["claims_decided"] += 1
                b["claimant_won"] += c["trial_result"] != "lost"
            if c["amount_claimed"] and c["amount_awarded"] is not None and c["amount_claimed"] > 0:
                b["award_to_claim"].append(c["amount_awarded"] / c["amount_claimed"])
            if c["amount_awarded"]:
                b["awards"].append(c["amount_awarded"])
            if c["appeal_result"] in ("affirmed", "reversed", "modified", "vacated-remanded"):
                b["appeals"] += 1
                b["affirmed"] += c["appeal_result"] == "affirmed"

    def med(v):
        return round(statistics.median(v), 3) if v else None

    summary = {
        "opinions_read": len(rows), "extracted": len(ok), "errors": len(rows) - len(ok),
        "commercial_real_estate": len(cre), "usable_for_calibration": len(usable),
        "cost_usd": round(cost, 2), "cost_per_opinion": round(cost / max(1, len(rows)), 4),
        "unverified_figures_dropped": sum(len(r.get("unverified", [])) for r in ok),
        "states": dict(by_state.most_common()),
        "categories": {k: {"cases": v["cases"], "usable": v["usable"],
                           "claimant_win_rate": round(v["claimant_won"] / v["claims_decided"], 3) if v["claims_decided"] else None,
                           "median_award_to_claim": med(v["award_to_claim"]), "award_to_claim_n": len(v["award_to_claim"]),
                           "appeal_affirm_rate": round(v["affirmed"] / v["appeals"], 3) if v["appeals"] else None,
                           "median_award": med(v["awards"])}
                       for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1]["cases"])},
        "court_types": dict(collections.Counter((meta.get(r["id"]) or {}).get("jurisdiction") or "?" for r in cre)),
    }
    out = os.path.join(os.path.dirname(path) or ".", "summary.json")
    json.dump(summary, open(out, "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:])
