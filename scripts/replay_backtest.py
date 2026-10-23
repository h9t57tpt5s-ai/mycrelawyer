#!/usr/bin/env python3
"""Replay saved backtest runs under the live range/best-guess math (v4.3).

No API calls: every v4+ result stores each claim's strength band
(probabilityRange), claimant and verified figures, and the numbers are
pure arithmetic on those. A formula change can therefore be tested on
the saved runs for free before any paid run (Jeff, 2026-09-25: "why
can't these tests be done locally instead of a way that incurs api
charges?").

  python3 scripts/replay_backtest.py results-v4 results-v4b
"""

import glob
import json
import math
import re
import sys

ROOT = "case_valuation_project/backtest/"
FEE = re.compile(r"attorney|counsel|legal fees", re.I)
HOLDOUTS = {"island-girl-outfitters-v-allied-development-2025", "udot-boggess-draper-2025", "dover-mall-v-tang-2023",
            "nco-montgomery-park-2025", "edgemere-lawal-2025", "navient-v-bpg-office-partners-2023"}


def basis_of(issue):
    """Stored from v4.1 on; for v4 results, inferred from the saved range."""
    if issue.get("basis"):
        return issue["basis"]
    figs = issue.get("figures") or []
    vals = [f["value"] for f in figs]
    d = issue.get("damagesRange")
    if len(vals) > 1 and d and {abs(d[0]), abs(d[1])} == {min(vals), max(vals)} and abs(abs(d[1]) - sum(vals)) > 0.5 and abs(abs(d[0]) - sum(vals)) > 0.5:
        return "competing"
    return "itemized"


BAND_RANK = {"conceded": 5, "strong": 4, "favorable": 3, "even": 2, "unfavorable": 1, "weak": 0}


def dedupe(issues):
    """Mirror of dedupeRepresentedFigures() in valuation-math.ts (v4.3)."""
    import itertools
    owner = {}
    for idx, i in enumerate(issues):
        if i.get("claimant") == "opposing":
            continue
        rank = BAND_RANK.get(i.get("strength"), 2)
        for f in i.get("figures") or []:
            if (f.get("role") or "amount") != "amount":  # v6: credits, caps, before/after values are not deduplicated
                continue
            k = round(f["value"] * 100)
            if k not in owner or rank > owner[k][0]:
                owner[k] = (rank, idx)
    values = sorted(k / 100 for k in owner)
    totals = set()
    for v in values:
        parts = [x for x in values if x < v]
        tol = max(1, v * 0.001)
        if any(abs(sum(c) - v) <= tol for n in (2, 3) for c in itertools.combinations(parts, n)):
            totals.add(round(v * 100))
    out = []
    for idx, i in enumerate(issues):
        if i.get("claimant") == "opposing":
            out.append(i)
            continue
        j = dict(i)
        j["figures"] = [f for f in i.get("figures") or [] if (f.get("role") or "amount") != "amount"
                        or (round(f["value"] * 100) not in totals and owner[round(f["value"] * 100)][1] == idx)]
        out.append(j)
    return out


def paired_losses(before, after):
    """Mirror of pairedLosses() in valuation-v6.ts (v6.1): each witness's
    before value with that witness's after value, in listed order; a lone
    value on one side pairs with every value on the other."""
    if len(before) == 1:
        pairs = [(before[0], a) for a in after]
    elif len(after) == 1:
        pairs = [(b, after[0]) for b in before]
    else:
        pairs = list(zip(before, after))
    return [max(0, b - a) for b, a in pairs]


def drop_large_totals(issues):
    """Mirror of dropLargeTotals() in valuation-v6.ts (v6.1): a represented
    amount equal to the sum of 4 or 5 others is a total of those parts."""
    import itertools
    vals = sorted({round(f["value"] * 100) for i in issues if i.get("claimant") != "opposing"
                   for f in i.get("figures") or [] if (f.get("role") or "amount") == "amount"})
    totals = set()
    for v in vals:
        parts = [x for x in vals if x < v]
        if not 4 <= len(parts) <= 16:
            continue
        tol = max(100, v * 0.001)
        if any(abs(sum(c) - v) <= tol for n in (4, 5) for c in itertools.combinations(parts, n)):
            totals.add(v)
    if not totals:
        return issues
    return [i if i.get("claimant") == "opposing" else
            {**i, "figures": [f for f in i.get("figures") or [] if (f.get("role") or "amount") != "amount"
                              or round(f["value"] * 100) not in totals]} for i in issues]


def v6_issue_range(issue, as_of):
    """Mirror of v6IssueRange() in valuation-v6.ts (figure roles, interest)."""
    import datetime as _dt
    figs = issue.get("figures") or []
    role = lambda r: [f for f in figs if (f.get("role") or "amount") == r]
    amounts, credits, caps = role("amount"), role("credit"), role("cap")
    before = [f["value"] for f in role("before_value")]
    after = [f["value"] for f in role("after_value")]
    base = issue_range({**issue, "figures": amounts, "claimant": "represented"}) if amounts else None
    if before and after:
        losses = paired_losses(before, after)
        if basis_of(issue) == "competing" and amounts:  # v6.1: competing opinions, not an add-on
            vals = [f["value"] for f in amounts] + losses
            lo, hi = min(vals), max(vals)
        else:
            lo, hi = min(losses), max(losses)
            if base:
                lo, hi = lo + base[0], hi + base[1]
    elif base:
        lo, hi = base
    else:
        return None
    it = issue.get("interest")
    if it and as_of:
        days = (_dt.date.fromisoformat(as_of) - _dt.date.fromisoformat(it["from"])).days
        if days > 0:
            yrs = min(days / 365.25, 30)
            lo, hi = lo * (1 + it["ratePercent"] / 100 * yrs), hi * (1 + it["ratePercent"] / 100 * yrs)
    credit = sum(f["value"] for f in credits)
    lo, hi = max(0, lo - credit), max(0, hi - credit)
    if caps:
        cap = min(f["value"] for f in caps)
        lo, hi = min(lo, cap), min(hi, cap)
    lo, hi = min(lo, hi), max(lo, hi)
    return [-hi, -lo] if issue.get("claimant") == "opposing" else [lo, hi]


def issue_range(issue, as_of=None):
    """Mirror of issueRange() in valuation-math.ts (v4 rules); v6 results
    (figures with roles) go through v6_issue_range()."""
    figs = issue.get("figures") or []
    if not figs:
        return None
    if as_of is not None and any("role" in f for f in figs):
        return v6_issue_range(issue, as_of)
    vals = [f["value"] for f in figs]
    if basis_of(issue) == "competing" and len(vals) >= 2:  # v4.4: a lone figure is itemized
        rng = [min(vals), max(vals)]
    else:
        rng = [sum(f["value"] for f in figs if not f.get("disputed")), sum(vals)]
    return [-rng[1], -rng[0]] if issue.get("claimant") == "opposing" else rng


def replay(pred):
    """Case range and best guess (fees excluded) under the live v4.3 math."""
    lo = hi = best = 0.0
    used = False
    issues = dedupe([i for i in (pred.get("issues") or []) if not FEE.search(i.get("label") or "")])
    as_of = pred.get("valuationDate") or ""  # set on v6 results
    if as_of:
        issues = drop_large_totals(issues)
    for i in issues:
        d, p = issue_range(i, as_of if as_of else None), i.get("probabilityRange")
        if not d or not p:
            continue
        used = True
        pm = (p[0] + p[1]) / 2
        if i.get("claimant") == "opposing":
            lo += p[1] * d[0]
            best += pm * (d[0] + d[1]) / 2
        else:
            lo += p[0] * d[0]
            hi += d[1]
            best += pm * d[1]
    ao = as_of if as_of else None
    rep_priced = any(i.get("claimant") != "opposing" and issue_range(i, ao) for i in issues)
    opp_priced = any(i.get("claimant") == "opposing" and issue_range(i, ao) for i in issues)
    unpriced_claim = any(i.get("claimant") != "opposing" and i.get("kind") == "claim" and not issue_range(i, ao) for i in issues)
    if not used or (not rep_priced and opp_priced and unpriced_claim):
        return None
    lo, hi = math.floor(lo), math.ceil(hi)
    # The live function caps the top-line range at the requested-relief
    # ceiling; the saved top-line shows it when it binds.
    top = pred.get("damagesRange")
    if top and top[1] is not None and top[1] < hi:
        hi, lo = math.ceil(top[1]), min(lo, math.ceil(top[1]))
    return {"range": [lo, hi], "best": min(max(best, lo), hi)}


def _load_holdouts():
    """Held-out flags from cases.json (v5 additions), plus the original six."""
    try:
        for c in json.load(open(ROOT + "cases.json")):
            if c.get("holdout"):
                HOLDOUTS.add(c["id"])
    except (OSError, ValueError):
        pass


_load_holdouts()


def load(dirname):
    out = {}
    for f in glob.glob(ROOT + dirname + "/*.json"):
        r = json.load(open(f))
        if r.get("status") == 200 and not r.get("void"):
            out[r["id"]] = r
    return out


def main():
    first, repeat = load(sys.argv[1]), load(sys.argv[2]) if len(sys.argv) > 2 else {}
    rows = []
    for cid, r in sorted(first.items()):
        o = r["outcome"]
        a = replay(r["prediction"] or {})
        b = replay(repeat[cid]["prediction"] or {}) if cid in repeat else None
        rows.append((cid, o.get("amount"), o.get("finalAmount"), a, b))

    def inside(res, x):
        return None if not res or x is None else res["range"][0] <= x <= res["range"][1]

    for label, sel in (("all", rows), ("training", [r for r in rows if r[0] not in HOLDOUTS]), ("held out", [r for r in rows if r[0] in HOLDOUTS])):
        trial = [inside(a, t) for _, t, _, a, _ in sel if inside(a, t) is not None]
        final = [inside(a, f) for _, _, f, a, _ in sel if inside(a, f) is not None]
        errs = sorted((a["best"] - f) / f for _, _, f, a, _ in sel if a and f)
        print(f"{label:9s} trial hits {sum(trial)}/{len(trial)}  final hits {sum(final)}/{len(final)}  "
              f"best guess within 25% of final {sum(abs(e) <= .25 for e in errs)}/{len(errs)}  "
              f"median error {errs[len(errs)//2]:+.0%}" if errs else label)
    diffs = []
    for cid, _, _, a, b in rows:
        if a and b:
            scale = max(abs(a["best"]), abs(b["best"])) or 1
            diffs.append((abs(a["best"] - b["best"]) / scale, max(abs(a["range"][0] - b["range"][0]), abs(a["range"][1] - b["range"][1])) / (max(abs(x) for x in a["range"] + b["range"]) or 1), cid))
    if diffs:
        d = sorted(x[0] for x in diffs)
        r = sorted(x[1] for x in diffs)
        print(f"repeat runs: {len(diffs)} pairs; best guess within 5% {sum(x <= .05 for x in d)}/{len(d)}, median diff {d[len(d)//2]:.1%}; "
              f"range bounds within 5% {sum(x <= .05 for x in r)}/{len(r)}, median {r[len(r)//2]:.1%}")
        for bd, rd, cid in sorted(diffs, reverse=True)[:6]:
            print(f"   largest: {cid[:34]:34s} best guess {bd:.0%}  range {rd:.0%}")


if __name__ == "__main__":
    main()
