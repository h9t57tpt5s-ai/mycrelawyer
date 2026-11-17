#!/usr/bin/env python3
"""Backstop for the verification gate (2026-11-16).

scripts/add_matters.py publishes a matter only after it passes
scripts/verify_matters.py, and records it in ops/matter-verification.json.
Anything that reaches js/data.js some other way (the cloud digest routine,
a hand edit) would skip that gate. This script, run by
.github/workflows/verify-matters.yml on every push that changes
js/data.js, takes any matter added on or after GATE_FROM that has no
ledger entry out of js/data.js and parks it in ops/held-matters/<id>.json
with the reason, so it never stays on the site. The health check reports
held matters.

  python3 scripts/hold_unverified.py [--dry-run]
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_case_fields import load_cases  # noqa: E402
from verify_matters import GATE_FROM, LEDGER  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
HELD = ROOT / "ops" / "held-matters"


def block(src, cid):
    """(start, end) of the matter's object in js/data.js, end exclusive of the trailing comma."""
    at = src.index(f'      id: "{cid}",')
    start = src.rindex("\n    {\n", 0, at) + 1
    end = src.index("\n    }", at) + len("\n    }")
    return start, end


def main():
    dry = "--dry-run" in sys.argv
    ledger = json.loads(LEDGER.read_text()).get("matters", {}) if LEDGER.exists() else {}
    cases = load_cases()
    unverified = [c for c in cases if (c.get("addedDate") or "") >= GATE_FROM and c["id"] not in ledger]
    if not unverified:
        print("All new matters are verified.")
        return
    src = DATA.read_text()
    for c in unverified:
        print(f"HOLD {c['id']} ({c.get('addedDate')}): {c.get('title', '')[:80]}")
        if dry:
            continue
        s, e = block(src, c["id"])
        # Remove the object and the comma that joins it to its neighbor.
        if src[e:e + 1] == ",":
            src = src[:s] + src[e + 2:]
        elif src[s - 2:s - 1] == ",":
            src = src[:s - 2] + src[e:]
        else:
            src = src[:s] + src[e:]
        HELD.mkdir(parents=True, exist_ok=True)
        (HELD / f"{c['id']}.json").write_text(json.dumps(dict(c, held="No verification record in ops/matter-verification.json: it did not pass scripts/verify_matters.py (source quotes for every figure and party, and an independent check). Re-run it through scripts/add_matters.py."), indent=1, ensure_ascii=False) + "\n")
        sync = ROOT / ".sync" / f"{c['id']}.json"
        if sync.exists():
            sync.unlink()
    if not dry:
        DATA.write_text(src)
        left = {c["id"] for c in load_cases()}
        assert not left & {c["id"] for c in unverified}, "held matters still in js/data.js"
        print(f"{len(unverified)} matter(s) held in ops/held-matters/.")


if __name__ == "__main__":
    main()
