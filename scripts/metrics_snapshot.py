#!/usr/bin/env python3
"""Daily snapshot of how the site is doing, for the self-improvement
routine (2026-10-08). Run by .github/workflows/metrics-snapshot.yml, which
first saves three site-metrics reports (last 1, 7 and 28 days of
public.site_events; no personal data) to /tmp.

Writes ops/metrics/latest.json and ops/metrics/history/<date>.json (kept
120 days): visits, page views, multi-page visits, the sign-in and follow
funnel, top pages and landing sources, plus the site audit summary and
what each data pipeline produced.

  python3 scripts/metrics_snapshot.py /tmp/m1.json /tmp/m7.json /tmp/m28.json
"""

import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
METRICS = ROOT / "ops" / "metrics"
KEEP_DAYS = 120


def load(path):
    try:
        return json.loads(pathlib.Path(path).read_text())
    except (FileNotFoundError, ValueError):
        return None


def window(report):
    """The parts of a site-metrics report worth tracking over time."""
    if not report or "sessions" not in report:
        return None
    by_event = dict(report.get("byEvent") or [])
    sessions = report.get("sessions") or 0
    return {
        "visits": sessions,
        "pageViews": report.get("pageViews"),
        "multiPageVisits": report.get("sessionsWithMoreThanOnePage"),
        "multiPageRate": round((report.get("sessionsWithMoreThanOnePage") or 0) / sessions, 4) if sessions else None,
        "funnel": report.get("funnel"),
        "signUps": report.get("signUps"),
        "follows": by_event.get("docket_follow", 0),
        "newsletterSignups": report.get("newsletterSignups"),
        "contactSends": report.get("contactSends"),
        "sourceClicks": report.get("sourceClicks"),
        "searches": report.get("searches"),
        "byEvent": by_event,
        "topPages": report.get("topPages"),
        "landingReferrers": report.get("landingReferrers"),
        "topMatters": report.get("topMatters"),
    }


def count(path, key="filings"):
    data = load(ROOT / "ops" / path) or {}
    return len(data.get(key) or [])


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    today = dt.date.today().isoformat()
    audit = load(METRICS / "audit.json") or {}
    snap = {
        "date": today,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "note": "Visits are tab sessions from js/track.js (crawlers filtered); the site is small, so read 7- and 28-day windows, not single days.",
        "last1Day": window(load(sys.argv[1])),
        "last7Days": window(load(sys.argv[2])),
        "last28Days": window(load(sys.argv[3])),
        "audit": {"summary": audit.get("summary"), "freshness": audit.get("freshness"), "pagesChecked": audit.get("pagesChecked")},
        "pipelines": {
            "chapter11Petitions": count("ch11-petitions.json"),
            "federalSuits": count("federal-suits.json"),
            "secLeads": count("sec-litigation-leads.json", "leads"),
            "wireLeads": count("securities-suit-leads.json", "leads"),
            "leadsHandled": len((load(ROOT / "ops" / "leads-handled.json") or {}).get("handled") or {}),
        },
    }
    METRICS.mkdir(parents=True, exist_ok=True)
    (METRICS / "history").mkdir(exist_ok=True)
    (METRICS / "latest.json").write_text(json.dumps(snap, indent=1) + "\n")
    (METRICS / "history" / f"{today}.json").write_text(json.dumps(snap, indent=1) + "\n")
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for f in (METRICS / "history").glob("*.json"):
        if f.stem < cutoff:
            f.unlink()
    w = snap["last7Days"] or {}
    print(f"Snapshot {today}: 7-day visits {w.get('visits')}, multi-page {w.get('multiPageVisits')}, "
          f"sign-ups {w.get('signUps')}, follows {w.get('follows')}; audit {snap['audit']['summary']}")


if __name__ == "__main__":
    main()
