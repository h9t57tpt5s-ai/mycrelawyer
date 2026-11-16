#!/usr/bin/env python3
"""Totals-only outcome statistics from the opinion database, for public pages.

Reads the gitignored extraction results (scripts/extract_opinion_outcomes.ts)
and writes js/opinion-outcomes.json: counts, rates and medians by case type,
state and claimant side. No case names, citations, parties or quotes leave
the research folder; the case-level database stays private (CLAUDE.md).

Only commercial real estate cases count (no residential, consumer or debt
collection). Dollar ratios use only figures whose verbatim quote was found
in the opinion and states that amount. A figure is published only when its
own sample has at least MIN_N claims.

  python3 scripts/aggregate_opinion_outcomes.py RESULTS.jsonl [MORE.jsonl ...]

When a case appears in more than one file, the later file wins, so pass the
Haiku screen first and the Opus re-reads after it.
"""
import collections
import datetime as dt
import json
import statistics
import sys

MIN_N = 20
# Checked 2026-11-16 by re-reading 402 of these cases with Claude Opus 5.5:
# Haiku agreed on scope (97%), case type (94%), state (98%), award amounts
# (93%) and appeal affirmance (within about 5 points), but it tends to skip
# claims that lost, so its trial win rates ran 3 to 18 points high, and its
# award-to-claim medians drifted in the small case types. So win rates are
# not published from Haiku reads, and the award-to-claim ratio only for the
# case types where both models agreed.
RATIO_CATS = {"lease-disputes", "lending-foreclosure", "eminent-domain", "construction-defect"}
CATS = ["lease-disputes", "lending-foreclosure", "eminent-domain", "zoning-land-use",
        "construction-defect", "premises-liability", "environmental", "reit-securities"]
# Claimant sides by case type. Roles are the model's free-text labels; only
# these groups are published, never the raw labels.
SIDES = {
    "lease-disputes": {"landlord": {"landlord", "lessor", "property owner", "owner"},
                       "tenant": {"tenant", "lessee", "subtenant"}},
    "lending-foreclosure": {"lender": {"lender"},
                            "borrower": {"borrower", "guarantor", "property owner", "owner"}},
    "eminent-domain": {"owner": {"property owner", "owner", "landowner", "condemnee"}},
    "zoning-land-use": {"owner": {"property owner", "developer", "owner", "landowner", "applicant"}},
    "construction-defect": {"owner": {"owner", "property owner"},
                            "contractor": {"contractor", "subcontractor", "general contractor"}},
    "premises-liability": {"injured": {"injured party"}},
    "environmental": {"owner": {"property owner", "owner"}},
    "reit-securities": {},
}
DECIDED = {"won", "partly-won", "lost"}
APPEALED = {"affirmed", "reversed", "modified", "vacated-remanded"}
FINAL_OK = {"stated-in-opinion", "equals-award-affirmed", "zero-after-reversal"}


def pct(a, b):
    return round(100 * a / b) if b else None


def quart(v):
    if len(v) < MIN_N:
        return None
    q = statistics.quantiles(v, n=4)
    return {"p25": round(q[0], 3), "median": round(statistics.median(v), 3), "p75": round(q[2], 3), "n": len(v)}


def side_stats(claims, cat, haiku_only):
    decided = [c for c in claims if c["trial_result"] in DECIDED]
    won = [c for c in decided if c["trial_result"] != "lost"]
    full = [c for c in decided if c["trial_result"] == "won"]
    ratio = [c["amount_awarded"] / c["amount_claimed"] for c in claims
             if c["amount_claimed"] and c["amount_claimed"] > 0 and c["amount_awarded"] is not None
             and c["trial_result"] in DECIDED]
    appealed = [c for c in claims if c["appeal_result"] in APPEALED]
    final = [c["final_amount"] / c["amount_claimed"] for c in claims
             if c["amount_claimed"] and c["amount_claimed"] > 0 and c["final_amount"] is not None
             and c["final_amount_basis"] in FINAL_OK]
    awards = [c["amount_awarded"] for c in claims if c["amount_awarded"]]
    out = {"claims": len(claims)}
    if len(decided) >= MIN_N and not haiku_only:
        out.update(decided=len(decided), wonPct=pct(len(won), len(decided)), fullWinPct=pct(len(full), len(decided)))
    if cat in RATIO_CATS and (q := quart(ratio)):
        out["awardToClaim"] = q
        out["fullRecoveryPct"] = pct(sum(r >= 0.95 for r in ratio), len(ratio))
        out["underHalfPct"] = pct(sum(r < 0.5 for r in ratio), len(ratio))
    if len(appealed) >= MIN_N:
        out.update(appealed=len(appealed), affirmedPct=pct(sum(c["appeal_result"] == "affirmed" for c in appealed), len(appealed)))
    if cat in RATIO_CATS and (q := quart(final)):
        out["finalToClaim"] = q
    if cat in RATIO_CATS and len(awards) >= MIN_N:
        out["medianAward"] = round(statistics.median(awards))
        out["awardsN"] = len(awards)
    return out


def slice_stats(cases, cat, haiku_only=True):
    claims_by_side = collections.defaultdict(list)
    for x in cases:
        for c in x["claims"]:
            role = (c["claimant_role"] or "").strip().lower()
            for side, names in SIDES[cat].items():
                if role in names:
                    claims_by_side[side].append(c)
    # The court's filing date, not the model's reading of the decision year.
    years = [x["_year"] for x in cases if x.get("_year")]
    levels = collections.Counter(x["court_level"] for x in cases)
    return {
        "cases": len(cases),
        "years": [min(years), max(years)] if years else None,
        "courtLevels": dict(levels.most_common()),
        "propertyTypes": dict(collections.Counter(x["property_type"] for x in cases if x["property_type"] != "Unknown").most_common(6)),
        "sides": {s: side_stats(v, cat, haiku_only) for s, v in claims_by_side.items()},
    }


def main(paths):
    by_id = {}
    models = collections.Counter()
    for p in paths:
        for line in open(p):
            r = json.loads(line)
            if r.get("extraction"):
                by_id[r["id"]] = r
    cre = []
    for r in by_id.values():
        x = r["extraction"]
        if x["is_commercial_real_estate"] and not x["residential_or_consumer"] and not x["debt_collection"] and x["category"] in CATS:
            x["_year"] = int(r["date_filed"][:4]) if r.get("date_filed") else None
            cre.append(x)
            models[r.get("model", "?")] += 1
    out = {
        "generated": dt.date.today().isoformat(),
        "note": "Totals only. Built by scripts/aggregate_opinion_outcomes.py from court opinions in CourtListener's public bulk data (2000 to 2026), with every dollar figure checked against the opinion's own words. Case-level data is not published.",
        "minN": MIN_N,
        "opinions": len(cre),
        "categories": {},
    }
    for cat in CATS:
        cs = [x for x in cre if x["category"] == cat]
        entry = slice_stats(cs, cat)
        states = collections.defaultdict(list)
        for x in cs:
            st = (x["state"] or "").strip().upper()
            if len(st) == 2 and st.isalpha():
                states[st].append(x)
        entry["states"] = {st: slice_stats(v, cat) for st, v in sorted(states.items()) if len(v) >= MIN_N}
        out["categories"][cat] = entry
    json.dump(out, open("js/opinion-outcomes.json", "w"), indent=1)
    print(f"{len(cre)} commercial cases; models {dict(models)}; wrote js/opinion-outcomes.json")
    for cat, e in out["categories"].items():
        print(cat, e["cases"], {s: (v.get("wonPct"), (v.get("awardToClaim") or {}).get("median"), v.get("affirmedPct")) for s, v in e["sides"].items()}, "states:", len(e["states"]))


if __name__ == "__main__":
    main(sys.argv[1:])
