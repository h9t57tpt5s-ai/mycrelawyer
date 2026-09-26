#!/usr/bin/env python3
"""Replay saved backtest runs under a different range/best-guess formula.

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


def v41_issue_range(issue):
    figs = issue.get("figures") or []
    if not figs:
        return None
    vals = [f["value"] for f in figs]
    rng = [min(vals), max(vals)] if basis_of(issue) == "competing" else [sum(vals), sum(vals)]
    return [-rng[1], -rng[0]] if issue.get("claimant") == "opposing" else rng


def replay(pred):
    """Case range and best guess (fees excluded) under v4.1 arithmetic."""
    lo = hi = best = 0.0
    used = False
    issues = [i for i in (pred.get("issues") or []) if not FEE.search(i.get("label") or "")]
    for i in issues:
        d, p = v41_issue_range(i), i.get("probabilityRange")
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
    # One-sided backstop, as in the live function.
    rep_priced = any(i.get("claimant") != "opposing" and v41_issue_range(i) for i in issues)
    opp_priced = any(i.get("claimant") == "opposing" and v41_issue_range(i) for i in issues)
    unpriced_claim = any(i.get("claimant") != "opposing" and i.get("kind") == "claim" and not v41_issue_range(i) for i in issues)
    if not used or (not rep_priced and opp_priced and unpriced_claim):
        return None
    lo, hi = math.floor(lo), math.ceil(hi)
    return {"range": [lo, hi], "best": min(max(best, lo), hi)}


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
