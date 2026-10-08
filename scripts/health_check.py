#!/usr/bin/env python3
"""Daily health check for credocket.com's automation.

A failure used to go unnoticed until someone saw the site: the Supabase
sync job failed on every run for two days (2026-09-27..29) and 21 matters
never reached the database or the watchlist alerts. This checks that
every scheduled job is working and the content is current, emails the
problems through the ingest-court-filings Edge Function (action
"ops-alert", recipient fixed in that function) and exits 1
so the GitHub run also shows red.

  python3 scripts/health_check.py [--no-email]

Env: GITHUB_TOKEN, GITHUB_REPOSITORY, SUPABASE_ANON_KEY, AUTOMATION_SECRET.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from check_case_fields import load_cases  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FUNCTION_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/ingest-court-filings"
SITE = "https://credocket.com"
# Scheduled or push-triggered jobs whose latest run must have succeeded.
# The backtest is manual and spends API credit, so it is not watched.
WORKFLOWS = {
    "court-filings-ingest.yml": "Counterparty surveillance (bankruptcy, federal, state, SEC)",
    "supabase-sync.yml": "Sync new matters to Supabase (watchlist alerts)",
    "prerender.yml": "Prerender counts and matter lists into the HTML",
    "tests.yml": "Tests",
    "docket-activity.yml": "Follow tracked federal dockets",
    "verify-signals.yml": "Verify and publish Market Signals",
    "weekly-newsletter.yml": "Weekly newsletter (New on CREdocket)",
    "engagement-report.yml": "Weekly engagement report",
    "lead-feeds.yml": "SEC litigation and class-action leads",
}
# GitHub starts scheduled runs up to ~4 hours late, so allow for it.
MAX_AGE_HOURS = {"surveillance": 18, "fresh filings": 18, "docket activity": 32}
CENTRAL = ZoneInfo("America/Chicago")


def now():
    return dt.datetime.now(dt.timezone.utc)


def hours_since(iso):
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (now() - t).total_seconds() / 3600


def gh(path):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}",
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def check_workflows(problems, notes):
    for wf, label in WORKFLOWS.items():
        try:
            runs = gh(f"actions/workflows/{wf}/runs?status=completed&per_page=1")["workflow_runs"]
        except urllib.error.HTTPError as err:
            problems.append(f"{label}: could not read its runs ({err.code})")
            continue
        if not runs:
            notes.append(f"{label}: no completed run yet")
            continue
        r = runs[0]
        when = r["updated_at"]
        if r["conclusion"] not in ("success", "skipped"):
            problems.append(f"{label}: latest run {r['conclusion']} at {when} -- {r['html_url']}")
        else:
            notes.append(f"{label}: OK ({when})")


def check_content(problems, notes):
    cases = load_cases()
    today = now().astimezone(CENTRAL).date()
    newest_event = max(c.get("date") or "" for c in cases)
    newest_added = max(c.get("addedDate") or "" for c in cases)
    lag = (today - dt.date.fromisoformat(newest_event)).days
    # Standing rule: the tracker carries events from the last day or two.
    if lag > 2:
        problems.append(f"Tracker is stale: newest event is dated {newest_event} ({lag} days ago)")
    else:
        notes.append(f"Newest event {newest_event} ({lag} days ago)")
    # Market Signals get new items at least weekly (digest routine,
    # Mondays and Thursdays; verified by verify-signals.yml).
    trends = load_trends()
    newest_trend = max((t.get("date") or "" for t in trends), default="")
    if not newest_trend or (today - dt.date.fromisoformat(newest_trend)).days > 10:
        problems.append(f"Market Signals: newest item is dated {newest_trend or 'never'}, more than 10 days ago")
    else:
        notes.append(f"Newest Market Signal {newest_trend}")
    rejected = sorted(p.name for p in (ROOT / "ops/pending-signals/rejected").glob("*.json"))
    if rejected:
        problems.append(f"{len(rejected)} Market Signal draft(s) failed source verification and need review: {', '.join(rejected)}")
    if (today - dt.date.fromisoformat(newest_added)).days > 1:
        problems.append(f"Digest routine has not added a matter since {newest_added}")
    else:
        notes.append(f"Newest matter added {newest_added}")
    return cases


def load_trends():
    loader = LOADER_TRENDS
    out = subprocess.run(["deno", "eval", "--no-config", loader, str(ROOT / "js/data.js")], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


LOADER_TRENDS = """
const src = await Deno.readTextFile(Deno.args[0]);
const w = {};
new Function("window", src.replace(/^\\s*const RELAW_DATA/m, "window.RELAW_DATA"))(w);
console.log(JSON.stringify(w.RELAW_DATA.trends || []));
"""


def check_sync_backlog(problems, notes):
    stuck = []
    for f in sorted((ROOT / ".sync").glob("*.json")):
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", str(f)], cwd=ROOT, capture_output=True, text=True)
        if out.stdout.strip() and hours_since(out.stdout.strip()) > 3:
            stuck.append(f.name)
    if stuck:
        problems.append(f"{len(stuck)} matter(s) waiting over 3 hours to sync to Supabase: {', '.join(stuck[:10])}")
    else:
        notes.append("Supabase sync: nothing waiting")


def check_ops_files(problems, notes):
    runs = json.loads((ROOT / "ops/alert-runs.json").read_text())
    runs = runs if isinstance(runs, list) else runs.get("runs", [])
    if runs:
        last = max(runs, key=lambda r: r["at"])
        age = hours_since(last["at"])
        if age > MAX_AGE_HOURS["surveillance"]:
            problems.append(f"Counterparty surveillance last ran {age:.0f} hours ago ({last['at']})")
        elif not last.get("ok", True) or last.get("errors"):
            problems.append(f"Counterparty surveillance run at {last['at']} reported errors: {last.get('errors')}")
        else:
            notes.append(f"Surveillance last ran {age:.0f}h ago, no errors")
    for name, path in (("fresh filings", "ops/fresh-filings.json"), ("docket activity", "ops/docket-activity.json")):
        p = ROOT / path
        if not p.exists():
            problems.append(f"{path} is missing")
            continue
        data = json.loads(p.read_text())
        age = hours_since(data["updatedAt"])
        if age > MAX_AGE_HOURS[name]:
            problems.append(f"{path} last updated {age:.0f} hours ago")
        elif data.get("errors"):
            problems.append(f"{path} reported errors: {data['errors']}")
        else:
            notes.append(f"{path} updated {age:.0f}h ago")


def check_live_site(cases, problems, notes):
    """The newest matter must be in the deployed data.js (Vercel deploys on
    every push). A bot challenge is reported as unchecked, not as down."""
    newest = max(cases, key=lambda c: (c.get("addedDate") or "", c["id"]))
    stamp = int(now().timestamp())
    # Pages load js/data-lite.js (rebuilt by prerender.yml from js/data.js).
    for path in ("/", f"/js/data-lite.js?hc={stamp}"):
        try:
            req = urllib.request.Request(SITE + path, headers={"User-Agent": "Mozilla/5.0 (CREdocket health check)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode(errors="replace")
        except urllib.error.HTTPError as err:
            if err.code in (403, 429):
                notes.append(f"Live site {path}: blocked by Vercel's bot check ({err.code}); not checked")
                return
            problems.append(f"Live site {path} returned HTTP {err.code}")
            return
        except Exception as err:
            problems.append(f"Live site {path} unreachable: {err}")
            return
        if path.startswith("/js/data-lite.js") and f'"{newest["id"]}"' not in body:
            problems.append(f"Live site is behind the repo: deployed data-lite.js lacks {newest['id']} (added {newest.get('addedDate')}); check the prerender run")
            return
    notes.append(f"Live site up and serving the newest matter ({newest['id']})")


def send_alert(problems, notes, test=False):
    subject = f"CREdocket health check: {len(problems)} problem{'s' if len(problems) != 1 else ''}"
    if test:
        subject = "TEST -- " + subject + " (checking that alerts reach you)"
    text = "\n".join([
        f"Checked {now().astimezone(CENTRAL):%A %b %-d, %-I:%M %p} Central.", "",
        "PROBLEMS", *([f"- {p}" for p in problems] or ["- None"]), "",
        "OK", *[f"- {n}" for n in notes], "",
        f"Runs: https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions",
    ])
    req = urllib.request.Request(
        FUNCTION_URL, method="POST",
        data=json.dumps({"action": "ops-alert", "subject": subject, "text": text}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}",
                 "apikey": os.environ["SUPABASE_ANON_KEY"], "x-automation-secret": os.environ["AUTOMATION_SECRET"]},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"Alert email: HTTP {r.status}")
    except urllib.error.HTTPError as err:
        print(f"Alert email FAILED: HTTP {err.code} {err.read().decode(errors='replace')[:300]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-email", action="store_true")
    ap.add_argument("--test-email", action="store_true", help="send the report even with no problems, marked as a test")
    args = ap.parse_args()
    problems, notes = [], []
    for step in (check_workflows, check_sync_backlog, check_ops_files):
        try:
            step(problems, notes)
        except Exception as err:
            problems.append(f"{step.__name__} could not run: {err}")
    try:
        cases = check_content(problems, notes)
        check_live_site(cases, problems, notes)
    except Exception as err:
        problems.append(f"content check could not run: {err}")

    print("PROBLEMS:" if problems else "No problems.")
    for p in problems:
        print(f"  - {p}")
    print("OK:")
    for n in notes:
        print(f"  - {n}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as fh:
            fh.write("## Problems\n" + ("".join(f"- {p}\n" for p in problems) or "None\n"))
            fh.write("## OK\n" + "".join(f"- {n}\n" for n in notes))
    if args.test_email and not problems:
        send_alert(problems, notes, test=True)
    if problems:
        if not args.no_email:
            send_alert(problems, notes)
        sys.exit(1)


if __name__ == "__main__":
    main()
