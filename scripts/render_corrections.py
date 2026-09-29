#!/usr/bin/env python3
"""Render js/corrections.json into corrections.html.

Fills the <!--prerender:corr-*--> blocks so the log reads without
JavaScript. Run by .github/workflows/prerender.yml whenever the log
changes; safe to run by hand.

  python3 scripts/render_corrections.py
"""

import datetime as dt
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOG = ROOT / "js" / "corrections.json"
PAGE = ROOT / "corrections.html"
SCOPES = {"matter": "Tracker matter", "tool": "Tool", "site": "Site label", "briefs": "CREdocket Briefs", "signal": "Market signal"}


def fmt(iso):
    d = dt.date.fromisoformat(iso)
    return f"{d:%b} {d.day}, {d.year}"


def esc(s):
    return html.escape(s or "", quote=True)


def entry_html(e):
    subject = esc(e["subject"])
    if e.get("caseId"):
        subject = f'<span data-case-id="{esc(e["caseId"])}" class="text-accent" style="cursor:pointer;">{subject}</span>'
    return f"""
      <li class="corr-entry">
        <div class="corr-meta"><span class="corr-date">{fmt(e["date"])}</span><span class="corr-kind">{esc(e["kind"])}</span><span class="corr-scope">{esc(SCOPES.get(e.get("scope"), ""))}</span></div>
        <div class="corr-subject">{subject}</div>
        <dl class="corr-body">
          <dt>Was</dt><dd>{esc(e["was"])}</dd>
          <dt>Now</dt><dd>{esc(e["now"])}</dd>
          <dt>Checked against</dt><dd>{esc(e["basis"])}</dd>
        </dl>
      </li>"""


def fill(page, block_id, content):
    pat = re.compile(rf"<!--prerender:{block_id}-->.*?<!--/prerender:{block_id}-->", re.S)
    if not pat.search(page):
        raise SystemExit(f"corrections.html has no prerender block {block_id}")
    return pat.sub(lambda _m: f"<!--prerender:{block_id}-->{content}<!--/prerender:{block_id}-->", page)


def main():
    log = json.loads(LOG.read_text())
    entries = sorted(log["entries"], key=lambda e: e["date"], reverse=True)
    counts = {}
    for e in entries:
        k = "removed" if e["kind"].startswith("Removed") else "corrected"
        counts[k] = counts.get(k, 0) + 1
    summary = (f'{len(entries)} entries since {fmt(log["startedOn"])}: '
               f'{counts.get("corrected", 0)} corrections and {counts.get("removed", 0)} removals. '
               f'Last entry {fmt(entries[0]["date"])}.') if entries else "No corrections yet."
    page = PAGE.read_text()
    page = fill(page, "corr-summary", esc(summary))
    page = fill(page, "corr-list", "".join(entry_html(e) for e in entries) + "\n    ")
    PAGE.write_text(page)
    print(summary)


if __name__ == "__main__":
    main()
