#!/usr/bin/env python3
"""Check candidate backtest cases against the protocol, then add them.

Every candidate must pass before it enters cases.json:
  - required fields and a court-hosted source URL
  - side: userSide and expectedRole agree with the category's fixed roles
  - leak guard: neither the trial amount nor the final amount appears in
    the input, in any common written form ($1,234,567 / 1234567 /
    $1.23 million / $1.2M), unless it is the party's own stated demand
  - verbatim: every sentence of documentText is found in the saved
    source text (compared on letters and digits only)
  - no duplicate of an existing case, and not a case in the calculator's
    own citation database (the model has seen those outcomes)
  - held-out cases are chosen here, before any run, by a hash of the id

  python3 scripts/intake_backtest_cases.py CANDIDATES.json [...] --sources DIR --exclude NAMES.txt [--apply]
"""

import argparse
import hashlib
import json
import pathlib
import re
import sys

CASES = pathlib.Path("case_valuation_project/backtest/cases.json")
ROLES = {
    "lease-disputes": ("Landlord", "Tenant"),
    "lending-foreclosure": ("Lender", "Borrower / Guarantor"),
    "construction-defect": ("Owner / Developer", "Contractor / Design Professional"),
    "eminent-domain": ("Property Owner", "Condemning Authority"),
    "zoning-land-use": ("Property Owner / Developer", "Municipality / Zoning Authority"),
    "premises-liability": ("Property Owner / Occupier", "Injured Party / Claimant"),
    "environmental": ("Property Owner / PRP", "Government / Other PRPs / Insurer"),
    "reit-securities": ("Shareholder / Plaintiff Class", "REIT / Board / Sponsor"),
}
ROLE_TO_CATEGORY = {role: (cat, side) for cat, pair in ROLES.items() for side, role in zip(("sideA", "sideB"), pair)}
HOLDOUT_SHARE = 5  # one case in five, by hash


def key(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def amount_forms(x):
    forms = {f"{x:,.2f}", f"{x:,.0f}", f"{x:.2f}", f"{int(round(x))}"}
    if x >= 1_000_000:
        m = x / 1_000_000
        forms |= {f"{m:.1f} million", f"{m:.2f} million", f"{m:g} million", f"{m:.1f}m", f"{m:g}m"}
    return {f for f in forms if len(re.sub(r"\D", "", f)) >= 3}


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?\"])\s+", text) if len(key(s)) >= 25]


def check(case, sources, excluded, existing_ids, existing_names):
    problems = []
    for field in ("id", "source", "input", "outcome", "expectedRole"):
        if field not in case:
            problems.append(f"missing {field}")
    if problems:
        return problems
    src, inp, out = case["source"], case["input"], case["outcome"]
    if not str(src.get("url", "")).startswith("https://"):
        problems.append("source.url is not an https link")
    role = case["expectedRole"]
    if role not in ROLE_TO_CATEGORY:
        problems.append(f"expectedRole {role!r} is not a calculator role")
    elif ROLE_TO_CATEGORY[role][1] != inp.get("userSide"):
        problems.append(f"userSide {inp.get('userSide')} does not match role {role!r}")
    if case["id"] in existing_ids:
        problems.append("duplicate id")
    name = key(src.get("caseName", ""))
    if name and any(name[:40] == n[:40] for n in excluded):
        problems.append("case is in the calculator's citation database")
    if name and any(name[:40] == n[:40] for n in existing_names):
        problems.append("duplicate of an existing case")
    text = (inp.get("description") or "") + " " + (inp.get("documentText") or "")
    low = text.lower()
    for label in ("amount", "finalAmount"):
        x = out.get(label)
        if isinstance(x, (int, float)) and x > 0 and not out.get("amountIsTheRequestedAmount"):
            hit = [f for f in amount_forms(x) if f.lower() in low]
            if hit:
                problems.append(f"outcome {label} appears in the input as {hit[0]!r}")
    src_file = sources / f"{case['id']}.txt"
    if not src_file.exists():
        problems.append("no saved source text")
    else:
        src_key = key(src_file.read_text(errors="replace"))
        missing = [s for s in sentences(inp.get("documentText") or "") if key(s) not in src_key]
        if missing:
            problems.append(f"{len(missing)} sentence(s) not found verbatim, e.g. {missing[0][:80]!r}")
    if not isinstance(out.get("amount"), (int, float)):
        problems.append("outcome.amount is not a number")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("candidates", nargs="+")
    ap.add_argument("--sources", required=True)
    ap.add_argument("--exclude", required=True)
    ap.add_argument("--apply", action="store_true", help="append the passing cases to cases.json")
    args = ap.parse_args()

    existing = json.loads(CASES.read_text())
    existing_ids = {c["id"] for c in existing}
    existing_names = {key(c["source"].get("caseName", "")) for c in existing}
    excluded = {key(n) for n in pathlib.Path(args.exclude).read_text().splitlines() if n.strip()}
    sources = pathlib.Path(args.sources)

    passed, failed = [], []
    for path in args.candidates:
        for case in json.loads(pathlib.Path(path).read_text()):
            problems = check(case, sources, excluded, existing_ids | {c["id"] for c in passed}, existing_names)
            if problems:
                failed.append((case.get("id", "?"), problems))
                continue
            case["category"] = ROLE_TO_CATEGORY[case["expectedRole"]][0]
            case["holdout"] = int(hashlib.sha1(case["id"].encode()).hexdigest(), 16) % HOLDOUT_SHARE == 0
            case["addedToBacktest"] = "2026-09-26"
            passed.append(case)
            existing_names.add(key(case["source"].get("caseName", "")))

    by_cat = {}
    for c in passed:
        by_cat.setdefault(c["category"], []).append(c)
    print(f"{len(passed)} passed, {len(failed)} rejected")
    for cat, cs in sorted(by_cat.items()):
        print(f"  {cat}: {len(cs)} ({sum(c['holdout'] for c in cs)} held out)")
    for cid, problems in failed:
        print(f"  REJECTED {cid}: {'; '.join(problems)}")
    if args.apply and passed:
        CASES.write_text(json.dumps(existing + passed, indent=1, ensure_ascii=False) + "\n")
        print(f"cases.json now holds {len(existing) + len(passed)} cases")


if __name__ == "__main__":
    main()
