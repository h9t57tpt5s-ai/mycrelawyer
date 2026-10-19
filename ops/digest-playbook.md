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

## Freshness floor (check this FIRST, every run)

The daily health check fails when the newest EVENT date in js/data.js (the
`date` field, not `addedDate`) is more than 2 weekdays old (Friday counts as
fresh through Tuesday; changed 2026-10-19). Matters added today
about last week's events do not count. At the start of every run compute
max(date) over all cases. If it is older than yesterday (UTC), this run's
first job, ahead of its beat, is to publish at least one matter whose event
(filing, ruling, settlement, sale order, foreclosure action) happened today
or yesterday: work ops/opinion-leads.json for opinions with dateFiled today
or yesterday, then search for news dated today or yesterday ("filed
Monday/Tuesday", "ruled on [weekday]", trade-press items dated today). A
same-day trade-press report of a new suit or ruling is acceptable when the
search result shows the article date and the facts you use; say in the body
that the account comes from that report. Do not end a run with "the tracker
already looks current" unless max(date) is today or yesterday.

## Where fresh stories come from (work these before general news searches)

0. ops/opinion-leads.json (added 2026-10-13): court opinions filed in the last
   few days on commercial real estate issues, WITH THE OPINION'S TEXT. A court
   opinion is a primary source you can write from directly, even though this
   environment cannot open web pages: when an opinion decides a commercial real
   estate dispute between businesses or governments, write the matter from the
   text (sourceUrl = downloadUrl if present, else opinionUrl; status "ruling" or
   "appeal"; date = dateFiled), stating only what the opinion says. Skip
   residential, consumer, criminal and individual-party cases. Record each lead
   in ops/leads-handled.json under its key ("opinion:<key>"). The 12:00 UTC run
   (court-rulings beat) works these first; the other runs take any left.

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

## Search titles (added 2026-10-14)

Give every new matter three more keys, placed right after `id`:
- `seoTitle` (65 characters or fewer): what people search for first (the
  building or street address, the well-known company, sponsor or lender, or
  the city or county in a zoning or condemnation fight), then what happened in
  plain words. Example: "Hotel Lincoln Chicago: CMBS Foreclosure by Wilmington Trust".
- `seoDescription` (120-155 characters): the same names plus the key fact.
- `property`: {name, address, city, state} when the matter is about one
  identifiable property, using only names and addresses the sources give;
  otherwise leave the key out.
These set the page's Google title and description; the headline stays
`title`. Same sourcing rules as everything else: no figure or name that is
not in the matter's own text. Matters sharing a property get a property page
automatically (scripts/build_entity_pages.ts).

## Market Signals (Monday and Thursday AM runs; added 2026-10-16)

The page went 11 days without a new item because the monthly trackers (KBRA,
CRED iQ, Trepp) all publish in the first days of a month and were older than
7 days by every mid-month run. Before skipping Step 4B, also search the
reports that do come out mid-month: quarterly office, industrial and retail
vacancy reports (Moody's, CBRE, Cushman & Wakefield, JLL, Colliers; Q3 reports
arrive in October), banks' quarterly earnings disclosures of CRE charge-offs
and nonaccruals, MBA quarterly origination and delinquency reports, Green
Street CPPI and MSCI RCA price indexes, and ATTOM commercial foreclosure
counts, including trade-press articles (GlobeSt, Bisnow, Commercial Observer,
Connect CRE, CRE Daily) that quote the figures. A Market Signal every week is
required; skipping is the last resort.
Do not use therealdeal.com as a signal sourceUrl: it blocks the GitHub verifier
(trend-021, 2026-10-16, rejected with every quote "not found" although the
page matched when opened locally). credaily.com and cushmanwakefield.com pass.
Also blocked (403 to the verifier, 2026-10-19): chainstoreage.com and bank
investor-relations sites (ir.mtb.com); for a Colliers/CBRE figure use the
firm's own page or credaily.com. Quotes must be the page's exact words: the
trend-022 draft's "quotes" were paraphrases with two figures the article did
not contain. A bank's total credit-loss provision is not a CRE figure (scope);
use its CRE charge-offs or nonaccruals only when the release states them.
Next id: one above the highest trend id in js/data.js AND every file under
ops/pending-signals/ (rejected/ and rejected/reviewed/ included); trend-021
was assigned to three different drafts.

## How to judge a candidate

- Prefer the event date (filing, ruling, settlement) within 7 days.
- An older event goes in only if it is significant and the coverage is new.
- Record every lead you skip in ops/leads-handled.json with a specific reason
  ("no coverage yet", "residential", "individual party", "duplicate of
  live-NNN", "not real estate"), so the reasons can be studied.

## Bare court-docket leads with no coverage (added 2026-10-17)

Of the 101 leads logged in ops/leads-handled.json between 2026-10-08 and
2026-10-17, 85 were skipped and 30 of those 85 (35%) were "no reporting
found explaining the dispute" / "no coverage found explaining the filing" --
by far the single biggest skip reason, ahead of every scope reason
(residential, individual party, etc.) combined. Nearly all of them were bare
ops/federal-suits.json or ops/ch11-petitions.json entries: a single-asset LLC
Chapter 11 petition, or a small federal suit between an LLC and its insurer
or lender, with no named sponsor/REIT/lender large enough to draw trade
press, and no opinion text (the case just filed) to write from directly.

This is not lost coverage: scripts/ingest_court_filings.py and
build_record_pages.ts already give every single one of these filings its
own page (chapter-11/<slug>.html or federal-cases/<slug>.html, listed on
bankruptcy-watch.html/lawsuit-watch.html) automatically, on a pipeline
separate from this digest -- confirmed 2026-10-17 by checking that every
sampled "no coverage found" lead (Madison Development LLC; Byblos
Development, Inc. v. First-Citizens Bank & Trust Company; PNC Bank, N.A. v.
WB Real Estate Development LLC) already has its own record page. Skipping
one of these as a narrative matter write-up does not remove it from the
site.

So: for a bare docket lead with no named major player and no opinion text,
one targeted search (the parties' names together with the property or
project name, if the filing gives one, plus "lawsuit") is enough -- if
nothing comes back, record the skip and move on rather than trying several
query variants on the same lead. Spend the saved search budget on
higher-yield sources instead: this week's opinion-leads.json entries, SEC/
wire leads naming a public company, and trade-press searches for this run's
beat. If a bare docket lead DOES name a well-known sponsor, lender, REIT,
hotel brand or developer, or the suit amount is unusually large for its
type, that is exactly the case worth a second, differently-worded search
before giving up -- this guidance is about the ordinary small-LLC-vs-insurer
case, not about trying less hard on the leads most likely to matter.

## What we have learned

<!-- The self-improvement routine adds dated lines here: what changed in the digest's guidance and what happened to the news metrics afterwards. -->
- 2026-10-13: Starting point. Week of 2026-10-06: 23 sourced matters, 5 within 7 days of the event, median 97 days from event to publication; 14 of 15 leads skipped. Record-only petition matters were banned on 2026-10-12.
- 2026-10-17: The news goal (ops/metrics/goals.json) now reads "on track" (gap 0.0): 50 sourced matters in the last 7 days, 41 of them fresh, median 5.0 days event-to-publication -- all past target, and backlog item G1 (added 2026-10-13, asking for exactly this fix) is done; marked struck in ops/improvement-playbook.md's backlog. Looked for patterns in the skip reasons as G1 also asked: of 101 leads logged 2026-10-08 through 2026-10-17, 85 were skipped and 30 of those (35%) were bare court-docket leads (small Chapter 11 petitions, small LLC-vs-insurer federal suits) with no secondary reporting to write a narrative matter from -- confirmed these still get their own page automatically via the separate ingest/record-page pipeline, so the skip is not a real coverage loss. Added guidance above ("Bare court-docket leads with no coverage") to spend one targeted search on these rather than several variants, and put the saved effort toward opinion/SEC/trade-press leads, which is where matters actually come from. Watching sourcedMatters7/freshSourcedMatters7/medianDaysEventToAdded (baseline 50/41/5.0) for 7 days to confirm this doesn't regress the pipeline that got the goal on track.
