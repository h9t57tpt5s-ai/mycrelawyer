#!/usr/bin/env python3
"""Daily scoreboard for the site's five goals (2026-10-13), read by the
self-improvement routine to decide which goal to work on next and printed in
the Monday email.

  traffic       visits and Google landings
  conversion    sign-ups, follows, newsletter sign-ups, multi-page visits
  news          fresh, sourced matters and how fast they follow the event
  calculator    backtest accuracy and how often the tool is used
  subscription  readiness of the paid product (checklist in ops/improvement-playbook.md)

Each goal gets metrics, a target and a status: "behind", "on track" or "no
data". Targets are set in TARGETS below and can be changed by Jeff.

  python3 scripts/goal_scoreboard.py   -> ops/metrics/goals.json (needs ops/metrics/latest.json)
"""

import datetime as dt
import json
import pathlib
import re
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from check_case_fields import load_cases  # noqa: E402

TARGETS = {
    "traffic": {"visits7": 350, "googleLandings7": 200},
    "conversion": {"signUps7": 5, "follows7": 3, "newsletterSignups7": 3, "multiPageRate7": 0.08},
    "news": {"freshSourcedMatters7": 7, "medianDaysEventToAdded": 14, "sourcedMatters7": 10},
    "calculator": {"finalRangeHitRate": 0.75, "calculatorViews7": 50},
}
TODAY = dt.date.today()

# /contact.html has had repeated, irregular bot-traffic bursts since 2026-10-28
# (ops/improvement-playbook.md backlog G19): single days where it jumps from
# its normal ~0-4% share of visits to 20-58%, with multiPageRate collapsing
# because those are single-page bot hits, not real visitors. This inflates
# visits7 and crushes multiPageRate7 for up to 7 days per burst. Compute a
# bot-adjusted version from the daily history so a verdict doesn't have to
# redo this by hand every time (done manually in imp-047/048/053).
CONTACT_BOT_SHARE_THRESHOLD = 0.20  # a day's /contact.html share above this is an outlier
CONTACT_BOT_MIN_COUNT = 20  # ...and only when it's also not just a handful of hits
CONTACT_BOT_NORMAL_SHARE = 0.03  # a generous normal /contact.html share to leave untouched


def load_recent_days(root, n=7):
    hist_dir = root / "ops" / "metrics" / "history"
    files = sorted(hist_dir.glob("20*.json"))[-n:]
    days = []
    for f in files:
        d = load(f).get("last1Day") or {}
        if d.get("visits") is not None:
            days.append((f.stem, d))
    return days


def bot_adjusted_week(root, n=7):
    days = load_recent_days(root, n)
    if len(days) < max(5, n - 2):
        return None  # too little history to trust a 7-day reconstruction
    visits_adj_total = 0
    multi_total = 0
    flagged = []
    for date_str, d in days:
        visits = d.get("visits") or 0
        multi = d.get("multiPageVisits")
        if multi is None:
            multi = round((d.get("multiPageRate") or 0) * visits)
        pages = dict(d.get("topPages") or [])
        contact = pages.get("/contact.html", 0)
        share = (contact / visits) if visits else 0
        excess = 0
        if share > CONTACT_BOT_SHARE_THRESHOLD and contact > CONTACT_BOT_MIN_COUNT:
            excess = max(0, contact - round(CONTACT_BOT_NORMAL_SHARE * visits))
            flagged.append(date_str)
        visits_adj_total += visits - excess
        multi_total += multi
    return {
        "visits7Adjusted": visits_adj_total,
        "multiPageRate7Adjusted": round(multi_total / visits_adj_total, 4) if visits_adj_total else None,
        "botFlaggedDays7": flagged,
        "daysUsed": len(days),
    }


def load(path):
    try:
        return json.loads(pathlib.Path(path).read_text())
    except (FileNotFoundError, ValueError):
        return {}


# leadsReviewedTotal/leadsToMattersTotal are since-inception counters that
# only ever grow, so any window's raw totals always look like they
# "improved" regardless of what actually happened that week (imp-041,
# 2026-11-05, had to hand-derive the real window ratio to catch this).
# Compute the trailing-N-day rate directly from each handled lead's own
# "at" date instead, so a future verdict gets a real number for free.
def leads_window_ratio(root, days=7):
    handled = (load(root / "ops" / "leads-handled.json").get("handled") or {}).values()
    cutoff = (TODAY - dt.timedelta(days=days)).isoformat()
    window = [h for h in handled if (h.get("at") or "") >= cutoff]
    reviewed = len(window)
    to_matters = sum(1 for h in window if str(h.get("action", "")).startswith("matter"))
    return {
        "leadsReviewedWindow7": reviewed,
        "leadsToMattersWindow7": to_matters,
        "leadsToMattersRatio7": round(to_matters / reviewed, 4) if reviewed else None,
    }


def status(values, targets, lower_is_better=()):
    behind = []
    for k, t in targets.items():
        v = values.get(k)
        if v is None:
            continue
        if (k in lower_is_better and v > t) or (k not in lower_is_better and v < t):
            behind.append(k)
    if all(values.get(k) is None for k in targets):
        return "no data", behind
    return ("behind" if behind else "on track"), behind


def gap(values, targets, lower_is_better=()):
    """0 = every target met; 1 = every metric at zero. Used to rank goals."""
    parts = []
    for k, t in targets.items():
        v = values.get(k)
        if v is None or not t:
            continue
        ratio = (t / v if v else 4) if k in lower_is_better else (v / t)
        parts.append(max(0.0, 1 - min(ratio, 1)))
    return round(sum(parts) / len(parts), 3) if parts else None


def main():
    latest = load(ROOT / "ops" / "metrics" / "latest.json")
    w7 = latest.get("last7Days") or {}
    refs = dict(w7.get("landingReferrers") or [])
    pages = dict(w7.get("topPages") or [])

    traffic = {"visits7": w7.get("visits"), "googleLandings7": refs.get("google.com"),
               "visits28": (latest.get("last28Days") or {}).get("visits")}
    conversion = {"signUps7": w7.get("signUps"), "follows7": w7.get("follows"),
                  "newsletterSignups7": w7.get("newsletterSignups"), "multiPageRate7": w7.get("multiPageRate"),
                  "contactSends7": w7.get("contactSends")}
    bot = bot_adjusted_week(ROOT)
    if bot:
        traffic["visits7Adjusted"] = bot["visits7Adjusted"]
        conversion["multiPageRate7Adjusted"] = bot["multiPageRate7Adjusted"]
        conversion["botFlaggedDays7"] = bot["botFlaggedDays7"]

    week_ago = (TODAY - dt.timedelta(days=7)).isoformat()
    recent = [c for c in load_cases() if (c.get("addedDate") or "") >= week_ago]
    lags = [(dt.date.fromisoformat(c["addedDate"]) - dt.date.fromisoformat(c["date"])).days
            for c in recent if re.fullmatch(r"\d{4}-\d\d-\d\d", c.get("date") or "")]
    sourced = [c for c in recent if c.get("sourceUrl") and c.get("sourceUrl") != c.get("docketUrl") and len(c.get("body") or []) >= 3]
    fresh = [c for c in sourced if re.fullmatch(r"\d{4}-\d\d-\d\d", c.get("date") or "")
             and (dt.date.fromisoformat(c["addedDate"]) - dt.date.fromisoformat(c["date"])).days <= 7]
    handled = (load(ROOT / "ops" / "leads-handled.json").get("handled") or {}).values()
    news = {"sourcedMatters7": len(sourced), "freshSourcedMatters7": len(fresh),
            "medianDaysEventToAdded": statistics.median(lags) if lags else None,
            "leadsReviewedTotal": len(list(handled)),
            "leadsToMattersTotal": sum(1 for h in (load(ROOT / "ops" / "leads-handled.json").get("handled") or {}).values()
                                       if str(h.get("action", "")).startswith("matter")),
            **leads_window_ratio(ROOT)}

    bt = {}
    raw = (ROOT / "js" / "backtest-results-data.js").read_text() if (ROOT / "js" / "backtest-results-data.js").exists() else ""
    if raw:
        data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
        versions = data.get("versions") or {}
        latest_v = sorted(versions)[-1] if versions else None
        s = (versions.get(latest_v) or {}).get("summary") or {}
        bt = {"version": latest_v, "finalRangeHitRate": round(s["finalHits"] / s["finalScorable"], 3) if s.get("finalScorable") else None,
              "casesScored": s.get("scored"), "medianBestGuessError": s.get("finalBestGuessMedianError", s.get("medianBestGuessError")),
              "resultsGeneratedAt": data.get("generatedAt")}
    # toolViews counts every case-valuation* view; topPages is only the top
    # 10 and made the calculator read 0 (2026-10-16). Fall back for old snapshots.
    tool_views = w7.get("toolViews") or {}
    calc_views = tool_views["case-valuation"] if "case-valuation" in tool_views else sum(v for k, v in pages.items() if "case-valuation" in k)
    calculator = {**bt, "calculatorViews7": calc_views if pages else None}

    goals = {}
    for name, values, lower in (("traffic", traffic, ()), ("conversion", conversion, ()),
                                ("news", news, ("medianDaysEventToAdded",)), ("calculator", calculator, ())):
        st, behind = status(values, TARGETS[name], lower)
        goals[name] = {"status": st, "behind": behind, "gap": gap(values, TARGETS[name], lower),
                       "metrics": values, "targets": TARGETS[name]}
    goals["subscription"] = {"status": "see checklist", "behind": [], "gap": None,
                             "metrics": {"note": "Readiness checklist in ops/improvement-playbook.md ('Subscription readiness'); pricing and billing are Jeff's decisions."},
                             "targets": {}}
    ranked = sorted((g for g in goals if goals[g]["gap"] is not None), key=lambda g: -goals[g]["gap"])
    out = {"date": TODAY.isoformat(), "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "mostBehind": ranked, "goals": goals}
    (ROOT / "ops" / "metrics" / "goals.json").write_text(json.dumps(out, indent=1) + "\n")
    for g in ranked:
        print(f"{g}: {goals[g]['status']} (gap {goals[g]['gap']}) behind on {', '.join(goals[g]['behind']) or 'nothing'}")


if __name__ == "__main__":
    main()
