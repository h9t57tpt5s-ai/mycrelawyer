#!/usr/bin/env python3
"""Write the existing-matters list the newsroom task checks for duplicates.

One line per matter: id | title | parties. Written to .task-tmp/existing.txt
(git-ignored) so the unattended newsroom run never needs shell redirection
or a path outside the repo, either of which can stop it at an approval
prompt (2026-10-17 to 10-23 it waited six days on one).

  python3 scripts/list_matters.py
"""

import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".task-tmp" / "existing.txt"

JS = 'const s=Deno.readTextFileSync("js/data.js");const d=new Function(s+";return RELAW_DATA;")();' \
     'console.log(JSON.stringify(d.cases.map(c=>[c.id,c.title,(c.parties||[]).map(p=>p.name).join("; ")])))'


def main():
    out = subprocess.run(["deno", "eval", JS], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    rows = json.loads(out)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(" | ".join(r) for r in rows) + "\n")
    print(f"{len(rows)} matters written to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
