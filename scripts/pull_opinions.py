#!/usr/bin/env python3
"""This week's court opinions on commercial real estate, with their text,
for the digest routine (2026-10-13).

The digest routine runs in a cloud environment that cannot open web pages,
so it could only write from search snippets and kept publishing old news.
Court opinions are primary sources and public domain: this job (GitHub
Actions, which can reach CourtListener) finds opinions filed in the last few
days that deal with commercial leases, guaranties, commercial foreclosure,
receivers, liens, condemnation, zoning and similar issues, fetches each
opinion's text, and writes ops/opinion-leads.json. The routine writes a
matter straight from the opinion (sourceUrl = the opinion) when it is a
commercial real estate dispute between businesses or governments.

Uses the CourtListener API with COURTLISTENER_TOKEN (search type=o, then
/opinions/<id>/ for the text). Budget: --budget requests (default 20).

  python3 scripts/pull_opinions.py [--days 4] [--budget 20] [--dry-run]
"""

import argparse
import datetime as dt
import html
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "opinion-leads.json"
API = "https://www.courtlistener.com/api/rest/v4/"
SITE = "https://www.courtlistener.com"
KEEP_DAYS = 6
MAX_TEXT = 12000
MAX_KEEP = 40

# The search: opinions mentioning commercial real estate disputes. The text
# test below decides what is kept.
QUERY = ('("commercial lease" OR "shopping center" OR "office building" OR "ground lease" OR "guaranty" '
         'OR "mortgage foreclosure" OR "receiver" OR "mechanic\'s lien" OR "mechanics lien" OR "eminent domain" '
         'OR condemnation OR "special use permit" OR "zoning" OR "CMBS" OR "landlord" OR "tenant improvement" '
         'OR "purchase and sale agreement" OR "certificate of occupancy")')
CRE_TERMS = re.compile(
    r"commercial lease|shopping center|office building|ground lease|retail space|warehouse|industrial|hotel|"
    r"guarant(y|or)|mortgage|deed of trust|foreclos|receiver|mechanic'?s lien|eminent domain|condemnation|"
    r"zoning|special use permit|variance|cmbs|special servicer|landlord|tenant improvement|purchase and sale agreement|"
    r"easement|developer|commercial property|real property tax|assessment appeal|data center|construction defect", re.I)
NOT_CRE = re.compile(
    r"residential tenant|homeowner|home ?owners association|single-family home|mobile home|manufactured home|"
    r"divorce|custody|criminal|sentenc|habeas|workers'? compensation|personal injury protection|"
    r"no-fault|medical malpractice|wrongful death|consumer|debt collector|student loan", re.I)


class Client:
    def __init__(self, token, budget):
        self.token, self.remaining = token, budget

    def get(self, url):
        if self.remaining <= 0:
            raise RuntimeError("budget used up")
        self.remaining -= 1
        headers = {"User-Agent": "CREdocket opinion leads (credocket.com)"}
        if self.token:
            headers["Authorization"] = f"Token {self.token}"
        for attempt in range(2):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                    data = json.load(r)
                time.sleep(13)  # CourtListener allows about 5 requests a minute
                return data
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
                code = getattr(err, "code", 500)
                if attempt == 1 or (code < 500 and code != 429):
                    raise
                time.sleep(65 if code == 429 else 20)


def plain(opinion):
    for k in ("plain_text", "html_with_citations", "html", "html_lawbox", "html_columbia", "xml_harvard"):
        t = opinion.get(k) or ""
        if t.strip():
            if k != "plain_text":
                t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
                t = html.unescape(re.sub(r"<[^>]+>", " ", t))
            return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", t)).strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=4)
    ap.add_argument("--budget", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    today = dt.date.today()
    since = (today - dt.timedelta(days=args.days)).isoformat()
    cl = Client(os.environ.get("COURTLISTENER_TOKEN", ""), args.budget)
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    known = {l["key"]: l for l in prev.get("leads", [])}

    params = {"type": "o", "order_by": "dateFiled desc", "q": f"{QUERY} AND dateFiled:[{since} TO *]"}
    url = API + "search/?" + urllib.parse.urlencode(params)
    hits = []
    while url and len(hits) < 40 and cl.remaining > 0:  # two pages; the rest of the budget reads opinions
        page = cl.get(url)
        hits += page.get("results", [])
        url = page.get("next")
    print(f"{len(hits)} opinions filed since {since} matched the search")

    new, checked = [], 0
    for h in hits:
        key = str(h.get("cluster_id"))
        if key in known or not h.get("opinions"):
            continue
        if NOT_CRE.search((h.get("caseName") or "") + " " + " ".join(o.get("snippet") or "" for o in h["opinions"])):
            continue
        if cl.remaining <= 0:
            print("Budget used up; the rest wait for the next run.")
            break
        op = h["opinions"][0]
        try:
            detail = cl.get(f"{API}opinions/{op['id']}/")
        except Exception as err:  # keep going with the others
            print(f"  could not fetch opinion {op.get('id')}: {err}")
            continue
        checked += 1
        text = plain(detail)
        terms = sorted({m.group(0).lower() for m in CRE_TERMS.finditer(text[:60000])})
        noise = len(NOT_CRE.findall(text[:20000]))
        print(f"  {h.get('dateFiled')} {h.get('court_id')} | {(h.get('caseName') or '')[:70]} | {len(text)} chars, "
              f"{len(terms)} CRE terms, {noise} non-CRE -> {'keep' if len(terms) >= 2 and noise <= 3 else 'drop'}")
        if len(terms) < 2 or noise > 3:
            continue
        new.append({
            "key": key, "caseName": h.get("caseName"), "court": h.get("court"), "courtId": h.get("court_id"),
            "dateFiled": h.get("dateFiled"), "docketNumber": h.get("docketNumber"),
            "opinionUrl": SITE + h["absolute_url"] if h.get("absolute_url") else None,
            "downloadUrl": op.get("download_url") or detail.get("download_url"),
            "matchedTerms": terms[:15], "textChars": len(text), "text": text[:MAX_TEXT],
            "firstSeen": today.isoformat(),
        })
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    leads = [l for l in known.values() if l.get("firstSeen", "") >= cutoff] + new
    leads = sorted(leads, key=lambda l: (l.get("dateFiled") or "", l["key"]), reverse=True)[:MAX_KEEP]
    print(f"Checked {checked} opinion texts, kept {len(new)} new; {len(leads)} on file; {args.budget - cl.remaining} requests")
    for l in new:
        print(f"  {l['dateFiled']} {l['courtId']} | {(l['caseName'] or '')[:80]} | {', '.join(l['matchedTerms'][:5])}")
    if args.dry_run:
        return
    OUT.write_text(json.dumps({
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "about": "Court opinions filed in the last few days that discuss commercial real estate issues, with the opinion's text (public domain) so the digest routine can write from the primary source. Leads, not publications: the routine decides what is a commercial real estate dispute between businesses or governments.",
        "leads": leads}, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
