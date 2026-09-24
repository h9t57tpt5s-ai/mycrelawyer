#!/usr/bin/env python3
"""Check the tracker's structured fields in js/data.js.

Every matter added on or after REQUIRED_FROM must carry the keys
`parties`, `judge` and `amountUsd` (values may be [] / null when no source
states them, but the key must be present). Every matter, old or new, that
has these fields must have well-formed values. Exits non-zero on any
defect so the research routine refuses to push it.

  python3 scripts/check_case_fields.py
"""

import json
import pathlib
import shutil
import subprocess
import sys

REQUIRED_FROM = "2026-10-01"
BASES = {"loan", "damages sought", "judgment", "award", "settlement", "claim", "purchase price", "other"}
DATA = pathlib.Path(__file__).resolve().parent.parent / "js" / "data.js"

# data.js is plain JavaScript, so let Deno evaluate it rather than parse it.
LOADER = """
const src = await Deno.readTextFile(Deno.args[0]);
const w = {};
new Function("window", src.replace(/^\\s*const RELAW_DATA/m, "window.RELAW_DATA"))(w);
console.log(JSON.stringify((w.RELAW_DATA ?? globalThis.RELAW_DATA).cases));
"""


NODE_LOADER = (
    "const src=require('fs').readFileSync(process.argv[1],'utf8');const w={};"
    "new Function('window',src.replace(/^\\s*const RELAW_DATA/m,'window.RELAW_DATA'))(w);"
    "console.log(JSON.stringify(w.RELAW_DATA.cases));"
)


def load_cases():
    # Deno locally and in CI; Node in the cloud research environment.
    if shutil.which("deno"):
        cmd = ["deno", "eval", "--no-config", LOADER, str(DATA)]
    elif shutil.which("node"):
        cmd = ["node", "-e", NODE_LOADER, str(DATA)]
    else:
        sys.exit("Needs deno or node to evaluate js/data.js.")
    out = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if out.returncode:
        sys.exit(f"Could not evaluate js/data.js:\n{out.stderr}")
    return json.loads(out.stdout)


def check(cases):
    problems = []
    for c in cases:
        cid = c.get("id", "?")
        added = c.get("addedDate") or ""
        if added >= REQUIRED_FROM:
            for key in ("parties", "judge", "amountUsd"):
                if key not in c:
                    problems.append(f"{cid}: missing required key `{key}` (added {added})")
        if "parties" in c:
            ps = c["parties"]
            if not isinstance(ps, list):
                problems.append(f"{cid}: parties must be a list")
            else:
                for p in ps:
                    if not isinstance(p, dict) or not str(p.get("name", "")).strip() or not str(p.get("role", "")).strip():
                        problems.append(f"{cid}: each party needs a non-empty name and role: {p!r}")
        if "judge" in c and c["judge"] is not None and (not isinstance(c["judge"], str) or not c["judge"].strip()):
            problems.append(f"{cid}: judge must be a non-empty string or null")
        if "judge" in c and isinstance(c["judge"], str) and c["judge"].lower().startswith(("judge ", "hon.", "justice ")):
            problems.append(f"{cid}: judge should be the name without a title: {c['judge']!r}")
        if "amountUsd" in c and c["amountUsd"] is not None:
            v = c["amountUsd"]
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0:
                problems.append(f"{cid}: amountUsd must be a positive number or null, got {v!r}")
            elif c.get("amountBasis") not in BASES:
                problems.append(f"{cid}: amountUsd needs amountBasis, one of {sorted(BASES)}")
    return problems


def main():
    cases = load_cases()
    problems = check(cases)
    required = [c for c in cases if (c.get("addedDate") or "") >= REQUIRED_FROM]
    with_parties = sum(1 for c in cases if c.get("parties"))
    print(f"{len(cases)} matters; {with_parties} with parties; "
          f"{sum(1 for c in cases if c.get('judge'))} with a judge; "
          f"{sum(1 for c in cases if c.get('amountUsd'))} with a dollar amount; "
          f"{len(required)} added on or after {REQUIRED_FROM}.")
    for p in problems:
        print("  " + p)
    if problems:
        sys.exit(f"{len(problems)} problem(s).")
    print("OK")


if __name__ == "__main__":
    main()
