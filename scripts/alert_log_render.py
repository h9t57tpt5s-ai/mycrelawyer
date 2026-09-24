"""Render the public alert audit log (alert-log.html) from run records.

Called by scripts/ingest_court_filings.py after every surveillance run.
Fills the <!--prerender:ID--> blocks so the page reads without
JavaScript. Aggregates only: the audit data carries no party, portfolio or
user names, because a named match would reveal whom a customer watches.
"""

import datetime as dt
import html
import re

SOURCE_LABELS = {
    "courtlistener": "Federal courts (every Chapter 11 petition; civil suits naming a saved entity)",
    "sec_edgar": "SEC Form 8-K, Items 1.03, 2.04 and 3.01",
    "hillsborough_fl": "Hillsborough County, Florida (commercial case types)",
    "harris_jp_tx": "Harris County, Texas justice courts (commercial evictions)",
}
RUN_SOURCE_LABELS = {
    "courtlistener": "Federal",
    "sec_edgar": "SEC",
    "Hillsborough FL": "Hillsborough",
    "Harris County TX justice courts": "Harris JP",
}
FILING_TYPES = {
    "bankruptcy_ch11": "Chapter 11 petition",
    "civil": "Civil suit",
    "sec_8k": "SEC 8-K",
}
CELL = "padding:8px 10px 8px 0; border-bottom:1px solid var(--border-soft); vertical-align:top;"
NUM = CELL + " text-align:right; white-space:nowrap;"


def esc(x):
    return html.escape(str(x), quote=True)


def fmt_time(iso):
    """UTC ISO timestamp -> 'Sep 24, 10:31 am CT' (Central, DST-aware enough
    for display: CDT from the second Sunday in March to the first Sunday in
    November)."""
    if not iso:
        return "—"
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    y = t.year
    start = dt.datetime(y, 3, 8, 8, tzinfo=dt.timezone.utc)
    start += dt.timedelta(days=(6 - start.weekday()) % 7)
    end = dt.datetime(y, 11, 1, 7, tzinfo=dt.timezone.utc)
    end += dt.timedelta(days=(6 - end.weekday()) % 7)
    local = t + dt.timedelta(hours=-5 if start <= t < end else -6)
    return local.strftime("%b %-d, %-I:%M %p").replace("AM", "am").replace("PM", "pm") + " CT"


def minutes(a, b):
    if not a or not b:
        return None
    ta = dt.datetime.fromisoformat(a.replace("Z", "+00:00"))
    tb = dt.datetime.fromisoformat(b.replace("Z", "+00:00"))
    return max(0, round((tb - ta).total_seconds() / 60))


def fmt_lag(mins):
    if mins is None:
        return "—"
    if mins < 90:
        return f"{mins} min"
    if mins < 48 * 60:
        return f"{round(mins / 60)} hr"
    return f"{round(mins / 1440)} days"


def row(label, value, note=""):
    note_html = f'<div class="text-muted" style="font-size:12px; margin-top:2px;">{note}</div>' if note else ""
    return f'<tr><td style="{CELL}">{label}{note_html}</td><td class="mono" style="{NUM}">{value}</td></tr>'


def summary_block(runs, audit):
    recent = [r for r in runs if r.get("at", "") >= (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()]
    ok = sum(1 for r in recent if r.get("ok"))
    rows = [row("Surveillance runs, last 30 days", f"{len(recent)}",
                f"{ok} completed cleanly; {len(recent) - ok} logged an error, listed below")]
    if audit:
        rows.append(row("Alerts raised", str(len(audit.get("alerts", []))),
                        "A saved name matched a new filing"))
        rows.append(row("Alerts emailed", str(audit.get("alertsEmailed", 0)),
                        f"Median {fmt_lag(audit.get('medianEmailMinutes'))} from match to email; slowest {fmt_lag(audit.get('maxEmailMinutes'))}"))
        rows.append(row("Alerts more than an hour overdue", str(audit.get("alertsOverdue", 0)),
                        "Matched but not yet emailed; a failed send is retried on every run for a week"))
        rows.append(row("Names under watch", str(audit.get("entitiesWatched", 0)),
                        f"Across {audit.get('portfolios', 0)} portfolio(s)"))
    else:
        rows.append(row("Alert figures", "unavailable", "The last run could not read them; the run log below still stands"))
    return f'<table style="width:100%; border-collapse:collapse; font-size:14px;"><tbody>{"".join(rows)}</tbody></table>'


def sources_block(audit):
    if not audit or not audit.get("sources"):
        return '<p class="text-muted" style="font-size:13px; margin:0;">No filings stored in the last 30 days.</p>'
    head = (f'<tr><th style="{CELL} text-align:left;">Source</th><th style="{NUM}">Filings stored</th>'
            f'<th style="{NUM}">Median days, filed to stored</th><th style="{NUM}">90th percentile</th></tr>')
    body = []
    for key, v in sorted(audit["sources"].items(), key=lambda kv: -kv[1]["stored"]):
        med, p90 = v.get("medianLagDays"), v.get("p90LagDays")
        body.append(f'<tr><td style="{CELL}">{esc(SOURCE_LABELS.get(key, key))}</td>'
                    f'<td class="mono" style="{NUM}">{v["stored"]:,}</td>'
                    f'<td class="mono" style="{NUM}">{"—" if med is None else med}</td>'
                    f'<td class="mono" style="{NUM}">{"—" if p90 is None else p90}</td></tr>')
    return (f'<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13.5px;">'
            f'<thead>{head}</thead><tbody>{"".join(body)}</tbody></table></div>')


def alerts_block(audit):
    alerts = (audit or {}).get("alerts") or []
    if not alerts:
        return '<p class="text-muted" style="font-size:13px; margin:0;">No saved name matched a new filing in the last 30 days.</p>'
    head = (f'<tr><th style="{CELL} text-align:left;">Filing</th><th style="{CELL} text-align:left;">Filed</th>'
            f'<th style="{CELL} text-align:left;">Matched</th><th style="{CELL} text-align:left;">Emailed</th>'
            f'<th style="{NUM}">Match to email</th></tr>')
    body = []
    for a in alerts:
        kind = FILING_TYPES.get(a.get("filingType"), a.get("filingType") or "Filing")
        src = RUN_SOURCE_LABELS.get(a.get("source"), SOURCE_LABELS.get(a.get("source"), a.get("source") or ""))
        conf = "exact name" if a.get("confidence") == "exact" else "probable name"
        emailed = fmt_time(a.get("emailedAt")) if a.get("emailedAt") else ('<strong>overdue</strong>' if a.get("overdue") else "pending")
        body.append(f'<tr><td style="{CELL}">{esc(kind)}<div class="text-muted" style="font-size:12px;">{esc(src)} · {conf}</div></td>'
                    f'<td style="{CELL} white-space:nowrap;">{esc(a.get("dateFiled") or "—")}</td>'
                    f'<td style="{CELL} white-space:nowrap;">{fmt_time(a.get("matchedAt"))}</td>'
                    f'<td style="{CELL} white-space:nowrap;">{emailed}</td>'
                    f'<td class="mono" style="{NUM}">{fmt_lag(minutes(a.get("matchedAt"), a.get("emailedAt")))}</td></tr>')
    return (f'<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13.5px;">'
            f'<thead>{head}</thead><tbody>{"".join(body)}</tbody></table></div>')


def runs_block(runs):
    if not runs:
        return '<p class="text-muted" style="font-size:13px; margin:0;">No runs recorded yet.</p>'
    head = (f'<tr><th style="{CELL} text-align:left;">Run started</th><th style="{CELL} text-align:left;">Pulled</th>'
            f'<th style="{NUM}">New matches</th><th style="{NUM}">Emails</th><th style="{CELL} text-align:left;">Result</th></tr>')
    body = []
    for r in runs[:60]:
        pulled = " · ".join(f"{RUN_SOURCE_LABELS.get(k, k)} {v}" for k, v in (r.get("sources") or {}).items()) or "—"
        errs = r.get("errors") or []
        result = "Clean" if r.get("ok") else ("Error: " + esc("; ".join(errs))[:240] if errs else "Error")
        emails = f'{r.get("emailsSent", 0)}' + (f' ({r.get("emailsFailed")} failed)' if r.get("emailsFailed") else "")
        body.append(f'<tr><td style="{CELL} white-space:nowrap;">{fmt_time(r.get("at"))}</td>'
                    f'<td style="{CELL}">{esc(pulled)}</td>'
                    f'<td class="mono" style="{NUM}">{r.get("newMatches", 0)}</td>'
                    f'<td class="mono" style="{NUM}">{emails}</td>'
                    f'<td style="{CELL} font-size:12.5px;">{result}</td></tr>')
    return (f'<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13.5px;">'
            f'<thead>{head}</thead><tbody>{"".join(body)}</tbody></table></div>')


def fill(page, block_id, content):
    pat = re.compile(rf"<!--prerender:{block_id}-->.*?<!--/prerender:{block_id}-->", re.S)
    if not pat.search(page):
        raise ValueError(f"alert-log.html is missing the {block_id} block")
    return pat.sub(lambda _m: f"<!--prerender:{block_id}-->{content}<!--/prerender:{block_id}-->", page)


def render(path, runs, audit):
    page = path.read_text()
    page = fill(page, "al-summary", summary_block(runs, audit))
    page = fill(page, "al-sources", sources_block(audit))
    page = fill(page, "al-alerts", alerts_block(audit))
    page = fill(page, "al-runs", runs_block(runs))
    stamp = fmt_time((audit or {}).get("generatedAt") or (runs[0]["at"] if runs else None))
    page = fill(page, "al-generated", f"Updated after the run of {stamp}.")
    path.write_text(page)
