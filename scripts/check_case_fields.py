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
import re
import pathlib
import shutil
import subprocess
import sys

REQUIRED_FROM = "2026-10-01"
# Every matter carries `brief`, the one-to-two-sentence scan line shown
# above the write-up on tracker cards (Jeff, 2026-10-23: readers should see
# what a case is about without reading the paragraph). Who, what happened,
# the stake; only facts and figures already in the matter's own text.
BRIEF_MIN, BRIEF_MAX = 60, 260
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
    # Duplicate guard (2026-09-26: the digest added MLP Ventures v. Upper
    # Merion a second time, same filing and same source article). Two
    # matters may not share a source article or a court docket.
    for field in ("sourceUrl", "docketUrl"):
        seen = {}
        for c in cases:
            v = (c.get(field) or "").strip().rstrip("/")
            # NYSCEF has no per-case link; the project rules use its search
            # page with the index number in docketLabel, so it repeats.
            if not v or "courtlistener.com/?" in v or "nyscef/CaseSearch" in v:
                continue
            if v in seen:
                problems.append(f"{c.get('id')}: same {field} as {seen[v]} -- likely a duplicate matter")
            else:
                seen[v] = c.get("id")
    for c in cases:
        cid = c.get("id", "?")
        added = c.get("addedDate") or ""
        brief = c.get("brief")
        if not brief:
            problems.append(f"{cid}: missing `brief` -- add a one-to-two-sentence scan line ({BRIEF_MIN}-{BRIEF_MAX} characters, right after `title`): who, what happened, the stake, using only facts and figures already in the summary")
        elif not BRIEF_MIN <= len(brief) <= BRIEF_MAX:
            problems.append(f"{cid}: `brief` is {len(brief)} characters; keep it to one or two sentences, {BRIEF_MIN}-{BRIEF_MAX} characters")
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
    for c in cases:
        if (c.get("addedDate") or "") >= STYLE_FROM:
            problems += [f"{c.get('id', '?')}: {s}" for s in style_problems(c)]
    return problems


# Writing rules learned from the 2026-11-16 audit of 48 write-ups sourced to
# The Real Deal (Jeff asked after one of its reporters signed up): most
# carried at least one error, padded the source with detail it does not
# contain, and almost none credited the outlet. Checked mechanically on
# matters added from STYLE_FROM on (older ones were reviewed by hand).
STYLE_FROM = "2026-11-17"
LOADED = re.compile(r"\b(troubled|embattled|beleaguered|struggling|notorious|walked away|undercapitali[sz]ed)\b", re.I)
# Sources that are the record itself; anything else is reporting to credit.
RECORD_HOSTS = re.compile(r"(courtlistener\.com|uscourts\.gov|\.gov$|\.us$|courts?\.|justia\.com|sec\.gov|documentcloud\.org|nycourts|govinfo)", re.I)
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                       "September", "October", "November", "December"], 1)}


def style_problems(c, today=None):
    import datetime as dt
    out = []
    text = " ".join([c.get("title") or "", c.get("brief") or "", c.get("summary") or "", c.get("significance") or "",
                     " ".join(c.get("body") or []), c.get("seoTitle") or "", c.get("seoDescription") or ""])
    unquoted = re.sub(r"[\"\u201c][^\"\u201d]*[\"\u201d]", " ", text)
    for m in sorted({m.group(0).lower() for m in LOADED.finditer(unquoted)}):
        out.append(f"calls a party '{m}' -- describe what the record says instead (Jeff, 2026-11-16)")
    host = re.sub(r"^www\.", "", re.sub(r"^https?://([^/]+).*", r"\1", c.get("sourceUrl") or ""))
    body = " ".join([c.get("summary") or ""] + (c.get("body") or []))
    if host and not RECORD_HOSTS.search(host) and not re.search(r"\breport(ed|s)\b|according to", body, re.I):
        out.append(f"relies on reporting ({host}) without crediting it -- say who reported it, e.g. 'The Real Deal reported'")
    if len(c.get("body") or []) > 5:
        out.append("body over 5 paragraphs -- write only what the sources support")
    today = today or dt.date.today()
    for e in c.get("timeline") or []:
        m = re.fullmatch(r"([A-Z][a-z]+) (\d{1,2}), (\d{4})", (e.get("when") or "").strip())
        if e.get("upcoming") and m and m.group(1) in MONTHS:
            if dt.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))) < today:
                out.append(f"timeline entry '{e.get('when')}' is marked upcoming but the date has passed")
    return out


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
