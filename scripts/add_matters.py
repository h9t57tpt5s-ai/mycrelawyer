#!/usr/bin/env python3
"""Append researched matters to js/data.js and queue their Supabase sync files.

Input: a JSON file holding a list of matter objects in the digest schema
(title, category, status, date, jurisdiction, state, amount, sourceUrl,
summary, significance, body, tags, parties, judge, amountUsd, amountBasis,
and optionally propertyType, docketUrl, docketLabel, timeline). Research-only
keys (sourcesOpened, verificationNote) are dropped. Each matter gets the next
live-NNN id and today's addedDate; lastUpdatedDate is set to today.

Refuses a matter that is missing a required field, uses an unknown category
or status, lacks a 3+ paragraph body, names a source that equals its docket
(record-only), or duplicates an existing title, source URL or docket URL.

  python3 scripts/add_matters.py new-matters.json [--dry-run]
"""

import datetime as dt
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
CATEGORIES = {"landlord-tenant", "zoning-land-use", "reit-securities", "construction-defect", "lending-foreclosure",
              "environmental", "eminent-domain", "lease-disputes", "premises-liability"}
STATUSES = {"filed", "pending", "ruling", "settled", "appeal"}
ORDER = ["id", "addedDate", "title", "category", "status", "date", "jurisdiction", "state", "amount", "source", "sourceUrl",
         "docketUrl", "docketLabel", "propertyType", "summary", "significance", "body", "tags", "parties", "judge",
         "amountUsd", "amountBasis", "timeline"]


def existing():
    out = subprocess.run(["deno", "eval", 'const s=Deno.readTextFileSync("js/data.js");'
                          'const d=new Function(s+";return RELAW_DATA;")();console.log(JSON.stringify(d.cases))'],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def problems(m, cases):
    p = []
    for k in ("title", "category", "status", "date", "jurisdiction", "sourceUrl", "summary", "significance", "body", "tags"):
        if not m.get(k):
            p.append(f"missing {k}")
    if m.get("category") not in CATEGORIES:
        p.append(f"unknown category {m.get('category')!r}")
    if m.get("status") not in STATUSES:
        p.append(f"unknown status {m.get('status')!r}")
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", m.get("date") or ""):
        p.append("date must be YYYY-MM-DD")
    if len(m.get("body") or []) < 3:
        p.append("body needs 3+ paragraphs")
    if m.get("docketUrl") and m.get("docketUrl") == m.get("sourceUrl"):
        p.append("record-only (source is the docket)")
    for k in ("parties", "judge", "amountUsd"):
        if k not in m:
            p.append(f"missing key {k}")
    norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())
    for c in cases:
        if norm(c.get("title")) == norm(m.get("title")):
            p.append(f"duplicate title of {c['id']}")
        if m.get("sourceUrl") and c.get("sourceUrl") == m["sourceUrl"]:
            p.append(f"same source as {c['id']}")
        if m.get("docketUrl") and c.get("docketUrl") == m["docketUrl"]:
            p.append(f"same docket as {c['id']}")
    return p


def js_value(v, indent):
    if isinstance(v, list) and v and isinstance(v[0], dict):
        inner = ",\n".join(" " * (indent + 2) + "{ " + ", ".join(f"{k}: {json.dumps(x[k], ensure_ascii=False)}" for k in x) + " }" for x in v)
        return "[\n" + inner + "\n" + " " * indent + "]"
    if isinstance(v, list) and v and all(isinstance(x, str) for x in v) and sum(len(x) for x in v) > 200:
        inner = ",\n".join(" " * (indent + 2) + json.dumps(x, ensure_ascii=False) for x in v)
        return "[\n" + inner + "\n" + " " * indent + "]"
    return json.dumps(v, ensure_ascii=False)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    dry = "--dry-run" in sys.argv
    new = json.loads(pathlib.Path(sys.argv[1]).read_text())
    cases = existing()
    # Never reuse an id: removed matters redirect elsewhere (vercel.json) and
    # their .sync files are already marked done.
    used = {int(c["id"].split("-")[1]) for c in cases}
    used |= {int(n) for n in re.findall(r"/matters/live-(\d+)\.html", (ROOT / "vercel.json").read_text())}
    used |= {int(n) for n in re.findall(r"live-(\d+)", " ".join(p.name for p in (ROOT / ".sync").glob("*")))}
    next_id = max(used) + 1
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()  # UTC, like the digest routine
    accepted, blocks = [], []
    for m in new:
        bad = problems(m, cases + accepted)
        if bad:
            print(f"SKIP {m.get('title','?')[:70]}: {'; '.join(bad)}")
            continue
        m = {k: v for k, v in m.items() if k not in ("sourcesOpened", "verificationNote")}
        m.update({"id": f"live-{next_id:03d}", "addedDate": today, "source": "live"})
        if m.get("amountUsd") is None:
            m.pop("amountBasis", None)
        next_id += 1
        accepted.append(m)
        keys = [k for k in ORDER if k in m and m[k] not in ("", None) or k in ("judge", "amountUsd", "parties")]
        lines = [f"      {k}: {js_value(m.get(k), 6)}" for k in keys]
        blocks.append("    {\n" + ",\n".join(lines) + "\n    }")
        print(f"ADD {m['id']} {m['date']} {m['category']} | {m['title'][:80]}")
    if not accepted or dry:
        return
    s = DATA.read_text()
    start = s.index("cases: [")
    end = s.index("\n  ],", start)
    s = s[:end] + ",\n" + ",\n".join(blocks) + s[end:]
    s = re.sub(r'lastUpdatedDate: "\d{4}-\d\d-\d\d"', f'lastUpdatedDate: "{today}"', s, count=1)
    DATA.write_text(s)
    sync = ROOT / ".sync"
    sync.mkdir(exist_ok=True)
    for m in accepted:
        (sync / f"{m['id']}.json").write_text(json.dumps({
            "id": m["id"], "title": m["title"], "category": m["category"], "status": m["status"], "date": m["date"],
            "jurisdiction": m["jurisdiction"], "state": m.get("state", ""), "amount": m.get("amount", ""), "source": "live",
            "source_url": m["sourceUrl"], "summary": m["summary"], "significance": m["significance"],
            "judge": m.get("judge"), "tags": m.get("tags", [])}, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(accepted)} matter(s) added; sync files queued.")


if __name__ == "__main__":
    main()
