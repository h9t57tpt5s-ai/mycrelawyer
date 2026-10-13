#!/usr/bin/env python3
"""Same-day court opinions from CourtListener's per-court feeds (2026-10-13).

pull_opinions.py searches the CourtListener API, which allows about 125
requests a day shared with three other jobs, so it reads only a handful of
opinions per run and missed several of 2026-10-13's best commercial real
estate rulings. CourtListener also publishes a public Atom feed per court
(courtlistener.com/feed/court/<id>/) listing each new opinion with a link to
its PDF on storage.courtlistener.com; neither counts against the API
allowance. This job reads the feeds of the state supreme and intermediate
appellate courts in the largest commercial real estate markets plus the
federal circuits, drops captions that are plainly criminal, family or
individual-only, downloads the remaining PDFs, and keeps opinions whose text
passes the same commercial real estate test as pull_opinions.py. Kept
opinions are merged into ops/opinion-leads.json (same keys as
pull_opinions.py, so the two never duplicate) for the digest routine.

  python3 scripts/pull_court_feeds.py [--days 3] [--max-pdfs 80] [--dry-run]
"""

import argparse
import datetime as dt
import html
import io
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from pull_opinions import CRE_TERMS, NOT_CRE, OUT, KEEP_DAYS, MAX_TEXT, MAX_KEEP  # noqa: E402

COURTS = (
    "cal calctapp ny nyappdiv tex texapp fla fladistctapp ill illappct pa pasuperct pacommwct nj njsuperctappdiv "
    "ga gactapp ohio ohioctapp mich michctapp va vactapp nc ncctapp wash washctapp ariz arizctapp colo coloctapp "
    "mass massappct md mdctspecapp minn minnctapp mo moctapp tenn tennctapp ind indctapp conn connappct wis wisctapp "
    "ky kyctapp la lactapp sc scctapp ala alacivapp okla oklacivapp or orctapp nev nevapp utah utahctapp "
    "del delch delsuperct ca1 ca2 ca3 ca4 ca5 ca6 ca7 ca8 ca9 ca10 ca11 cadc").split()
FEED = "https://www.courtlistener.com/feed/court/{}/"
UA = {"User-Agent": "CREdocket court feeds (credocket.com)"}
NS = {"a": "http://www.w3.org/2005/Atom"}

# Captions that are never a commercial real estate dispute between businesses
# or governments.
SKIP_CAPTION = re.compile(
    r"^(the )?(state|people|commonwealth|united states|usa)( of [a-z ]+)?,? v\.?\s|"
    r"\bv\.?\s+(the )?(state|people|commonwealth|united states)( of [a-z ]+)?\s*$|"
    r"\bin re:? (the )?(marriage|adoption|guardianship|custody|termination|parental|welfare|interest of|"
    r"commitment|conservatorship|disciplinary|[a-z]\.[a-z]?\.)|in the interest of|in the matter of the (estate|welfare)|"
    r"\bdivorce\b|\bhabeas\b|\bdisciplinary counsel\b|\bbar association\b|\bworkers'? comp", re.I)
# At least one business or government name in the caption.
ENTITY = re.compile(
    r"\b(llc|l\.l\.c|inc|corp(oration)?|company|co\.|l\.?p\.?|llp|bank|trust|n\.a\.|realty|propert(y|ies)|"
    r"holdings?|associates|partners(hip)?|development|investments?|ventures?|capital|mortgage|group|enterprises|"
    r"city|county|village|town(ship)?|borough|board|authority|commission|department|church|square feet|acres|"
    r"parcel|apartments|plaza|center|mall|hotel|owner)\b", re.I)


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def doc_text(url, data):
    """Opinion text from a PDF, or from the HTML copy some courts publish."""
    if not data.startswith(b"%PDF"):
        t = data.decode("utf-8", "replace")
        t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
        return html.unescape(re.sub(r"<[^>]+>", " ", t))
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages[:40])
    except Exception as err:  # a damaged PDF should not stop the run
        print(f"    could not read PDF: {err}")
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--max-pdfs", type=int, default=80)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    today = dt.date.today()
    since = (today - dt.timedelta(days=args.days)).isoformat()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    known = {l["key"]: l for l in prev.get("leads", [])}

    candidates, seen_feeds, seen_keys = [], 0, set()
    for court in COURTS:
        try:
            root = ET.fromstring(get(FEED.format(court)))
            seen_feeds += 1
        except Exception as err:
            print(f"  feed {court}: {err}")
            continue
        court_name = (root.findtext("a:title", "", NS) or "").replace("CourtListener.com: All opinions for the ", "")
        for e in root.findall("a:entry", NS):
            date = (e.findtext("a:published", "", NS) or "")[:10]
            title = html.unescape(e.findtext("a:title", "", NS) or "").strip()
            link = next((l.get("href") for l in e.findall("a:link", NS) if l.get("rel") == "alternate"), "")
            pdf = next((l.get("href") for l in e.findall("a:link", NS) if l.get("rel") == "enclosure"), "")
            m = re.search(r"/opinion/(\d+)/", link)
            if not m or date < since:
                continue
            key = m.group(1)
            same = (title.lower(), date)  # some courts post one decision under two ids
            if key in seen_keys or same in seen_keys:
                continue
            seen_keys.update({key, same})
            if key in known or SKIP_CAPTION.search(title) or not ENTITY.search(title) or NOT_CRE.search(title):
                continue
            candidates.append({"key": key, "caseName": title, "court": court_name, "courtId": court,
                               "dateFiled": date, "opinionUrl": link, "downloadUrl": pdf or None})
        time.sleep(1)
    candidates.sort(key=lambda c: c["dateFiled"], reverse=True)
    print(f"{seen_feeds} feeds read; {len(candidates)} new opinions since {since} with a business or government caption")
    if len(candidates) > args.max_pdfs:
        print(f"  reading the newest {args.max_pdfs}; {len(candidates) - args.max_pdfs} left for the next run")

    new = []
    for c in candidates[:args.max_pdfs]:
        if not c["downloadUrl"]:
            continue
        try:
            text = doc_text(c["downloadUrl"], get(c["downloadUrl"], timeout=90))
        except Exception as err:
            print(f"  could not fetch {c['downloadUrl']}: {err}")
            continue
        time.sleep(1)
        text = re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n\n", text)).strip()
        terms = sorted({m.group(0).lower() for m in CRE_TERMS.finditer(text[:60000])})
        noise = len(NOT_CRE.findall(text[:20000]))
        keep = len(terms) >= 2 and noise <= 3
        print(f"  {c['dateFiled']} {c['courtId']} | {c['caseName'][:70]} | {len(text)} chars, {len(terms)} CRE terms, "
              f"{noise} non-CRE -> {'keep' if keep else 'drop'}")
        if keep:
            new.append({**c, "matchedTerms": terms[:15], "textChars": len(text), "text": text[:MAX_TEXT],
                        "firstSeen": today.isoformat(), "via": "court feed"})

    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    leads = [l for l in known.values() if l.get("firstSeen", "") >= cutoff] + new
    leads = sorted(leads, key=lambda l: (l.get("dateFiled") or "", l["key"]), reverse=True)[:MAX_KEEP]
    print(f"Kept {len(new)} new; {len(leads)} on file")
    for l in new:
        print(f"  {l['dateFiled']} {l['courtId']} | {l['caseName'][:80]} | {', '.join(l['matchedTerms'][:5])}")
    if args.dry_run:
        return
    out = dict(prev) if prev else {}
    out.update({"updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "leads": leads})
    out.setdefault("about", "Court opinions filed in the last few days that discuss commercial real estate issues, with the opinion's text (public domain) so the digest routine can write from the primary source.")
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
