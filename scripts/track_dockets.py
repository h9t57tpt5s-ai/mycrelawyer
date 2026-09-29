#!/usr/bin/env python3
"""Follow tracked federal matters to their outcome.

For every tracker matter whose docketUrl is a CourtListener docket, pull
new docket entries and the docket's termination date, and write
ops/docket-activity.json. The site shows the latest entries on each
matter; the digest routine reads `events` (rulings, dismissals,
settlements, appeals, closings) and writes the verified update into the
matter itself, recording what it handled in ops/docket-activity-handled.json.

Cost: one CourtListener search covers up to 20 dockets, so a daily run
over ~40 dockets takes about 8 requests (budget 12) out of the token's
125/day, which the surveillance workflow also draws on.

Coverage is what CourtListener's RECAP archive holds: entries arrive from
court RSS feeds and RECAP uploads, so some are late or missing, and state
courts are not covered at all. Only the court's own short entry text is
stored (no filer or attorney names).

  python3 scripts/track_dockets.py [--days 10] [--dry-run]
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_case_fields import load_cases  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "docket-activity.json"
API = "https://www.courtlistener.com/api/rest/v4/search/"
SITE = "https://www.courtlistener.com"
BATCH = 20            # dockets per search; larger OR lists returned nothing in testing
KEEP_ENTRIES = 8      # most recent entries kept per docket
KEEP_EVENT_DAYS = 90
DOCKET_RE = re.compile(r"courtlistener\.com/docket/(\d+)/")

# A ruling or outcome worth a write-up. EXCLUDE wins, so "order granting
# extension" or "order on motion to continue" stays routine.
RULING = re.compile(
    r"\b(judgment|verdict|opinion|memorandum (and order|decision)|order on motion (to dismiss|for summary judgment"
    r"|for (a )?preliminary injunction|for (a )?temporary restraining order|to remand|for default judgment"
    r"|to compel arbitration|to transfer|for judgment on the pleadings|to appoint (a )?receiver|for relief from (the )?stay"
    r"|to confirm)|order (granting|denying)|dismiss(al|ed)|settle(ment|d)|notice of appeal|order appointing (a )?receiver"
    r"|order confirming|consent (judgment|decree)|remand(ed|ing)?|injunction|restraining order|case closed)\b", re.I)
EXCLUDE = re.compile(
    r"extension|extend|pro hac vice|adjourn|continu|scheduling|conference|briefing schedule|transcript"
    r"|appearance|corporate disclosure|summons|withdraw(al)? (as|of) (counsel|attorney)|seal", re.I)


def entry_text(doc):
    """The court's short entry label; falls back to the start of the long
    docket text, cut before any "filed by" / parenthetical names."""
    t = (doc.get("short_description") or "").strip()
    if not t:
        t = (doc.get("description") or "").strip()
        t = re.split(r"\s+filed by\s+|\s*\(|\s+re:?\s+\d", t, maxsplit=1, flags=re.I)[0]
    return re.sub(r"\s+", " ", t)[:160]


def is_ruling(text):
    # One entry can carry several orders ("Order on Motion to Dismiss AND
    # Order on Motion to Set a Briefing Schedule"); judge each part.
    return any(RULING.search(part) and not EXCLUDE.search(part) for part in re.split(r"\s+AND\s+", text or ""))


class Client:
    def __init__(self, token, budget):
        self.token, self.remaining = token, budget

    def get(self, url):
        if self.remaining <= 0:
            raise RuntimeError("CourtListener request budget used up")
        headers = {"User-Agent": "CREdocket docket tracker (credocket.com)"}
        if self.token:
            headers["Authorization"] = f"Token {self.token}"
        for attempt in range(3):
            self.remaining -= 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                    data = json.load(r)
                time.sleep(13)  # 5 requests a minute
                return data
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
                code = getattr(err, "code", None)
                print(f"  request failed ({code or err}); {self.remaining} left")
                if (code is not None and code < 500 and code != 429) or attempt == 2 or self.remaining <= 0:
                    raise
                time.sleep(30)

    def search(self, params):
        url = API + "?" + urllib.parse.urlencode(params)
        results = []
        while url:
            page = self.get(url)
            results += page.get("results", [])
            print(f"  {params.get('type')}: {len(results)} of {page.get('count')}")
            url = page.get("next")
            if url and self.remaining <= 0:
                # Newest first, so a cut-off run still has the latest entries.
                print("  budget used up; older pages skipped until the next run")
                break
        return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=4, help="look back this many days for new entries (21 on the first run)")
    ap.add_argument("--budget", type=int, default=12)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    today = dt.date.today()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {}
    days = args.days if prev else max(args.days, 21)
    since = (today - dt.timedelta(days=days)).isoformat()

    tracked = {}
    for c in load_cases():
        m = DOCKET_RE.search(c.get("docketUrl") or "")
        if m:
            tracked.setdefault(m.group(1), []).append({"id": c["id"], "status": c.get("status"), "added": c.get("addedDate") or ""})
    ids = sorted(tracked)
    print(f"{len(ids)} CourtListener dockets on {sum(len(v) for v in tracked.values())} matters; entries since {since}")

    def added_on(k):
        return min(m["added"] for m in tracked[k])

    cl = Client(os.environ.get("COURTLISTENER_TOKEN", ""), args.budget)
    dockets = {k: v for k, v in (prev.get("dockets") or {}).items() if k in tracked}
    events = {e["key"]: e for e in prev.get("events") or []}
    errors = []

    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        q = "docket_id:(" + " OR ".join(chunk) + ")"
        try:
            heads = cl.search({"type": "r", "q": q})
            docs = cl.search({"type": "rd", "q": f"{q} AND entry_date_filed:[{since} TO *]", "order_by": "entry_date_filed desc"})
        except Exception as err:  # keep the last good data for this batch
            errors.append(f"dockets {chunk[0]}..{chunk[-1]}: {err}")
            continue
        for h in heads:
            k = str(h["docket_id"])
            d = dockets.setdefault(k, {"entries": []})
            d.update({
                "caseIds": [m["id"] for m in tracked.get(k, [])],
                "court": h.get("court_citation_string") or h.get("court"),
                "docketNumber": h.get("docketNumber"),
                "dateTerminated": h.get("dateTerminated"),
                "url": SITE + h["docket_absolute_url"] if h.get("docket_absolute_url") else None,
            })
            # Only what happened after the matter was added is news; earlier
            # rulings are already in its write-up.
            if h.get("dateTerminated") and h["dateTerminated"] >= added_on(k):
                key = f"{k}:closed:{h['dateTerminated']}"
                open_status = [m["id"] for m in tracked.get(k, []) if m["status"] in ("filed", "pending")]
                if open_status and key not in events:
                    events[key] = {"key": key, "docketId": k, "caseIds": open_status, "date": h["dateTerminated"],
                                   "kind": "closed", "text": "Docket shows the case terminated", "url": d["url"],
                                   "firstSeen": today.isoformat()}
        for doc in docs:
            k = str(doc.get("docket_id"))
            if k not in tracked:
                continue
            d = dockets.setdefault(k, {"entries": [], "caseIds": [m["id"] for m in tracked[k]]})
            text = entry_text(doc)
            entry = {"date": doc.get("entry_date_filed"), "number": doc.get("entry_number"), "text": text,
                     "url": SITE + doc["absolute_url"] if doc.get("absolute_url") else d.get("url"),
                     "ruling": is_ruling(text)}
            ekey = f"{k}:{entry['number'] or ''}:{entry['date']}:{text.lower()}"
            if not any(f"{k}:{e['number'] or ''}:{e['date']}:{e['text'].lower()}" == ekey for e in d["entries"]):
                d["entries"].append(entry)
            if entry["ruling"] and (entry["date"] or "") >= added_on(k) and ekey not in events:
                events[ekey] = {"key": ekey, "docketId": k, "caseIds": [m["id"] for m in tracked[k]], "date": entry["date"],
                                "kind": "ruling", "text": text, "entry": entry["number"], "url": entry["url"],
                                "firstSeen": today.isoformat()}

    for k, d in dockets.items():
        for e in d["entries"]:
            e["ruling"] = is_ruling(e["text"])
            ekey = f"{k}:{e['number'] or ''}:{e['date']}:{e['text'].lower()}"
            if e["ruling"] and k in tracked and (e["date"] or "") >= added_on(k) and ekey not in events:
                events[ekey] = {"key": ekey, "docketId": k, "caseIds": [m["id"] for m in tracked[k]], "date": e["date"],
                                "kind": "ruling", "text": e["text"], "entry": e["number"], "url": e["url"],
                                "firstSeen": today.isoformat()}
        d["entries"] = sorted(d["entries"], key=lambda e: (e["date"] or "", e["number"] or 0), reverse=True)[:KEEP_ENTRIES]
        d["lastEntryDate"] = d["entries"][0]["date"] if d["entries"] else d.get("lastEntryDate")

    cutoff = (today - dt.timedelta(days=KEEP_EVENT_DAYS)).isoformat()
    kept = sorted((e for e in events.values() if (e["date"] or "") >= cutoff), key=lambda e: e["date"] or "", reverse=True)
    out = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": "CourtListener RECAP archive (federal courts only). Entries appear when CourtListener receives them, so some are late or missing.",
        "requestsUsed": args.budget - cl.remaining,
        "errors": errors,
        "dockets": dict(sorted(dockets.items())),
        "events": kept,
    }
    new = [e for e in kept if e["key"] not in {x["key"] for x in prev.get("events") or []}]
    print(f"{len(dockets)} dockets with data, {len(kept)} events kept, {len(new)} new, {out['requestsUsed']} requests")
    for e in new:
        print(f"  NEW {e['kind']}: {e['date']} {', '.join(e['caseIds'])} -- {e['text']}")
    for e in errors:
        print(f"  ERROR {e}")
    if args.dry_run:
        return
    if ids and len(errors) == -(-len(ids) // BATCH):
        sys.exit("Every batch failed; kept the previous file.")
    OUT.write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
