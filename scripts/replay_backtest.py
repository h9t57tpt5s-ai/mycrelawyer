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
        j["figures"] = [f for f in i.get("figures") or [] if round(f["value"] * 100) not in totals and owner[round(f["value"] * 100)][1] == idx]
        out.append(j)
    return out


def issue_range(issue):
    """Mirror of issueRange() in valuation-math.ts (v4 rules)."""
    figs = issue.get("figures") or []
    if not figs:
        return None
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
    for i in issues:
        d, p = issue_range(i), i.get("probabilityRange")
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
    rep_priced = any(i.get("claimant") != "opposing" and issue_range(i) for i in issues)
    opp_priced = any(i.get("claimant") == "opposing" and issue_range(i) for i in issues)
    unpriced_claim = any(i.get("claimant") != "opposing" and i.get("kind") == "claim" and not issue_range(i) for i in issues)
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
