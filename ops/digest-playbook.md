# Digest playbook

The twice-daily digest routine reads this file at the start of every run and
follows it. The self-improvement routine tunes it from the numbers in
ops/metrics/goals.json ("news" goal). It can only add or tighten guidance:
CLAUDE.md and the digest prompt win on any conflict (sourcing, commercial real
estate only, no individuals' names, no record-only matters, verified figures).

## The goal (scored daily in ops/metrics/goals.json)

- At least 10 sourced matters a week, 7 of them about events from the last 7 days.
- Median days from the event to publication: 14 or fewer. (Week of 2026-10-06: 97.)
- Every matter tells a reader something the court record alone does not: who,
  what property, how much, why it matters to owners, lenders or tenants.

## Where fresh stories come from (work these before general news searches)

1. Leads the site's own jobs found this week: ops/federal-suits.json (filed in
   the last 3 days), ops/sec-litigation-leads.json and
   ops/securities-suit-leads.json. For each federal suit naming a large
   lender, REIT, hotel or developer, search the parties' names together with
   "lawsuit" and the property for same-week coverage.
2. This week's appellate and supreme court decisions on commercial leases,
   guaranties, CMBS and receiverships, foreclosure, construction liens,
   condemnation and zoning: search "[state] supreme court" or "court of
   appeals" with those words and this week's dates. Court opinion pages are
   primary sources.
3. Trade press published today or yesterday: Bisnow, The Real Deal,
   Commercial Observer, GlobeSt, Connect CRE, the Business Journals, Law360
   headlines, plus the regional business journal for one under-covered state.
4. Only then, older stories that are newly reported and significant.

## Beat for each run (four runs a day since 2026-10-13)

Do the leads and fresh-filings steps every run, then spend most of the search
effort on this run's beat (by the UTC hour the run starts), so the four runs
cover the whole market instead of repeating the same national searches:

- 06:00 UTC: lending and distress. CMBS and bank foreclosures, receiverships,
  guaranty suits, special servicers, bankruptcies with real coverage.
- 12:00 UTC: court rulings issued in the last 3 days. State supreme courts,
  courts of appeals, federal courts, business courts (Texas, North Carolina,
  New York Commercial Division, Delaware), on leases, guaranties, foreclosure,
  liens, condemnation, zoning, tax appeals and property insurance.
- 17:00 UTC: leasing and development. Landlord-tenant fights with businesses,
  ground leases, data center and warehouse zoning, moratoria, eminent domain,
  construction and mechanics' lien suits on commercial projects.
- 22:00 UTC: the big players. REIT securities suits actually filed, sponsor
  and fund disputes, JV fights at major owners, brokerage and proptech suits,
  SEC and state enforcement, plus this run's geographic-diversity search.

## How to judge a candidate

- Prefer the event date (filing, ruling, settlement) within 7 days.
- An older event goes in only if it is significant and the coverage is new.
- Record every lead you skip in ops/leads-handled.json with a specific reason
  ("no coverage yet", "residential", "individual party", "duplicate of
  live-NNN", "not real estate"), so the reasons can be studied.

## What we have learned

<!-- The self-improvement routine adds dated lines here: what changed in the digest's guidance and what happened to the news metrics afterwards. -->
- 2026-10-13: Starting point. Week of 2026-10-06: 23 sourced matters, 5 within 7 days of the event, median 97 days from event to publication; 14 of 15 leads skipped. Record-only petition matters were banned on 2026-10-12.
