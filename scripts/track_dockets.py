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

Chapter 11 petitions (added 2026-10-07): commercial real estate petitions
from ops/ch11-petitions.json filed in the last 30 days, plus any petition a
reader follows, get the same check, limited to orders, judgments,
dismissals and closings so a busy new case does not page through every
filing. Written to ops/ch11-activity.json for the chapter-11/ pages.

Followers ("Email me when the court rules in this case"): the docket ids
readers follow come from the docket-follows Edge Function, are checked
first, and every ruling or closing first seen in the last 3 days is sent
back to it; the function emails each follower once per event.

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
CH11_OUT = ROOT / "ops" / "ch11-activity.json"
PETITIONS = ROOT / "ops" / "ch11-petitions.json"
PETITION_TRACK_DAYS = 30
NOTIFY_DAYS = 3       # events first seen this recently are (re)sent; the function sends each once
FOLLOWS_FN = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/docket-follows"
# Petition dockets: only entries that can be a ruling or an outcome.
PETITION_FILTER = "(order OR judgment OR dismiss OR dismissed OR dismissal OR confirming OR closed OR converting OR conversion)"
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


def call_follows(payload):
    """POST to the docket-follows function; None when not configured or failing."""
    secret = os.environ.get("AUTOMATION_SECRET", "")
    if not secret:
        return None
    req = urllib.request.Request(FOLLOWS_FN, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "x-automation-secret": secret,
        "Authorization": "Bearer " + os.environ.get("SUPABASE_ANON_KEY", ""), "apikey": os.environ.get("SUPABASE_ANON_KEY", "")})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as err:
        print(f"::warning::docket-follows {payload.get('action')} failed: {err}")
        return None


def track_petitions(cl, today, followed, dry_run):
    """Orders and outcomes on recent commercial real estate Chapter 11 dockets."""
    rows = json.loads(PETITIONS.read_text()).get("filings", []) if PETITIONS.exists() else []
    prev = json.loads(CH11_OUT.read_text()) if CH11_OUT.exists() else {}
    recent = (today - dt.timedelta(days=PETITION_TRACK_DAYS)).isoformat()
    by_id = {str(r["docketId"]): r for r in rows if r.get("docketId")}
    wanted = [k for k, r in by_id.items() if r["dateFiled"] >= recent or int(k) in followed]
    # Followed first, then newest, so a cut-off run covers what readers asked for.
    wanted = [k for k in wanted if int(k) in followed] + sorted((k for k in wanted if int(k) not in followed), key=lambda k: by_id[k]["dateFiled"], reverse=True)
    dockets = {k: v for k, v in (prev.get("dockets") or {}).items() if k in by_id}
    events = {e["key"]: e for e in prev.get("events") or []}
    errors = []
    print(f"{len(wanted)} Chapter 11 dockets to check ({sum(1 for k in wanted if int(k) in followed)} followed)")
    for i in range(0, len(wanted), BATCH):
        chunk = wanted[i:i + BATCH]
        # A docket seen before needs only the last few days; a new one, everything since filing.
        since = min((today - dt.timedelta(days=4)).isoformat() if k in dockets else by_id[k]["dateFiled"] for k in chunk)
        q = "docket_id:(" + " OR ".join(chunk) + ")"
        try:
            heads = cl.search({"type": "r", "q": q})
            docs = cl.search({"type": "rd", "q": f"{q} AND entry_date_filed:[{since} TO *] AND {PETITION_FILTER}", "order_by": "entry_date_filed desc"})
        except Exception as err:
            errors.append(f"dockets {chunk[0]}..{chunk[-1]}: {err}")
            if "budget" in str(err):
                break
            continue
        for k in chunk:
            dockets.setdefault(k, {"entries": []})["checkedAt"] = today.isoformat()
        for h in heads:
            k = str(h["docket_id"])
            if k not in by_id:
                continue
            d = dockets.setdefault(k, {"entries": []})
            d.update({"slug": by_id[k].get("slug"), "court": h.get("court_citation_string") or h.get("court"),
                      "docketNumber": h.get("docketNumber"), "dateTerminated": h.get("dateTerminated"),
                      "url": SITE + h["docket_absolute_url"] if h.get("docket_absolute_url") else by_id[k]["docketUrl"]})
            if h.get("dateTerminated"):
                key = f"{k}:closed:{h['dateTerminated']}"
                if key not in events:
                    events[key] = {"key": key, "docketId": k, "date": h["dateTerminated"], "kind": "closed",
                                   "text": "Docket shows the case closed", "url": d["url"], "firstSeen": today.isoformat()}
        for doc in docs:
            k = str(doc.get("docket_id"))
            if k not in by_id:
                continue
            d = dockets.setdefault(k, {"entries": []})
            text = entry_text(doc)
            entry = {"date": doc.get("entry_date_filed"), "number": doc.get("entry_number"), "text": text,
                     "url": SITE + doc["absolute_url"] if doc.get("absolute_url") else d.get("url"), "ruling": is_ruling(text)}
            ekey = f"{k}:{entry['number'] or ''}:{entry['date']}:{text.lower()}"
            if not any(f"{k}:{e['number'] or ''}:{e['date']}:{e['text'].lower()}" == ekey for e in d["entries"]):
                d["entries"].append(entry)
            if entry["ruling"] and ekey not in events:
                events[ekey] = {"key": ekey, "docketId": k, "date": entry["date"], "kind": "ruling", "text": text,
                                "entry": entry["number"], "url": entry["url"], "firstSeen": today.isoformat()}
    for d in dockets.values():
        d["entries"] = sorted(d["entries"], key=lambda e: (e["date"] or "", e["number"] or 0), reverse=True)[:KEEP_ENTRIES]
        d["lastEntryDate"] = d["entries"][0]["date"] if d["entries"] else d.get("lastEntryDate")
    cutoff = (today - dt.timedelta(days=KEEP_EVENT_DAYS)).isoformat()
    kept = sorted((e for e in events.values() if (e["date"] or "") >= cutoff and e["docketId"] in by_id), key=lambda e: e["date"] or "", reverse=True)
    out = {"updatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
           "source": "CourtListener RECAP archive (federal courts only): orders, judgments, dismissals and closings on recent commercial real estate Chapter 11 dockets. Entries appear when CourtListener receives them, so some are late or missing.",
           "errors": errors, "dockets": dict(sorted(dockets.items())), "events": kept}
    new = [e for e in kept if e["key"] not in {x["key"] for x in prev.get("events") or []}]
    print(f"Chapter 11: {len(dockets)} dockets with data, {len(kept)} events kept, {len(new)} new, {len(errors)} errors")
    for e in errors:
        print(f"  ERROR {e}")
    if not dry_run and (dockets or not CH11_OUT.exists()):
        CH11_OUT.write_text(json.dumps(out, indent=1) + "\n")
    return kept


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
    got = call_follows({"action": "dockets"})
    followed = set(got.get("dockets") or []) if got else set()
    print(f"{len(followed)} docket(s) followed by readers")
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
    all_failed = ids and len(errors) == -(-len(ids) // BATCH)
    if not args.dry_run and not all_failed:
        OUT.write_text(json.dumps(out, indent=1) + "\n")
    try:
        ch11_events = track_petitions(cl, today, followed, args.dry_run)
    except Exception as err:  # never lose the matters file over the petitions pass
        print(f"::warning::Chapter 11 pass failed: {err}")
        ch11_events = []
    out["requestsUsed"] = args.budget - cl.remaining
    if not args.dry_run and not all_failed:
        OUT.write_text(json.dumps(out, indent=1) + "\n")
    # Readers following a case: send every ruling or closing first seen in
    # the last few days (the function emails each one once), so a failed
    # call is retried by the next run.
    recent = (today - dt.timedelta(days=NOTIFY_DAYS)).isoformat()
    fresh = [{"key": e["key"], "docketId": str(e["docketId"]), "date": e.get("date"), "kind": e["kind"],
              "text": e["text"], "url": e.get("url")}
             for e in kept + ch11_events if (e.get("firstSeen") or "") >= recent and str(e["docketId"]) and int(e["docketId"]) in followed]
    if fresh and not args.dry_run:
        print(f"Followers: {call_follows({'action': 'notify', 'events': fresh})}")
    elif followed:
        print("Followers: nothing new to send")
    if all_failed:
        sys.exit("Every batch failed; kept the previous file.")


if __name__ == "__main__":
    main()
