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

Give every new matter these keys too (`brief` right after `title`; the other three right after `id`):
- `brief` (added 2026-10-23; required by scripts/check_case_fields.py): one or
  two sentences, 60-260 characters, placed right after `title`, shown above
  the write-up on tracker cards so readers can scan. Who, what happened, the
  stake (property and dollar amount if stated). Only facts and figures
  already in the matter's own summary; don't repeat the title. Shape:
  "[Lender] sued to foreclose a $[amount] loan on [property] in [city],
  saying [borrower] defaulted after [event]."
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

## Market Signals: do not draft them here (changed 2026-10-22)

Skip the digest prompt's Step 4E. This environment cannot open web pages, so
quotes rebuilt from search results never match the source word for word: all
three drafts queued from here (trend-021, -022, -023) failed verification, and
trend-023 repeated trend-020. CLAUDE.md now reserves Market Signal drafting to
sessions that open the source page (the local newsroom task). If a run comes
across a market-wide CRE data report worth a signal, name it and its URL in
the Step 5 report instead.

## Residential mortgage foreclosure opinions: skip without reading (added 2026-10-24)

ops/opinion-leads.json gives each lead's `caseName` and `matchedTerms` before
any opinion text needs reading. Checking every opinion-lead skip logged in
ops/leads-handled.json from 2026-10-14 through 2026-10-23 that gave a
"residential mortgage foreclosure" reason (Bank of America v. Hambrick; U.S.
Bank N.A. v. Sukljian/Pursoo/Vetri; U.S. Bank, N.A. v. Nektalov; Huntington
Natl. Bank v. Aquino; Wells Fargo Bank, Natl. Assn. v. Doberdruk; Bank of New
York Mellon v. Tope; U.S. Bank Trust Natl. Assn. v. He; and several more over
those 10 days) against today's live ops/opinion-leads.json: every single one
has `matchedTerms` equal to exactly `["foreclos", "mortgage"]` -- no other
term -- and a `caseName` where the defendant side is one person's name, no
LLC/Inc/Corp/LLP/Trust/Partners/Group/Realty suffix anywhere in the case
name. This exact shape has been a residential foreclosure on an individual
homeowner every time it has been checked, never commercial real estate.

So: read `matchedTerms` and `caseName` before opening an opinion lead's text.
When `matchedTerms` is exactly `{"foreclos", "mortgage"}` (nothing else) and
the case name has no business-entity suffix on either side, skip it
immediately -- record it as "residential mortgage foreclosure (caseName
pattern), not read" and move to the next lead, rather than opening the full
opinion to confirm what the pattern has already shown 12+ times running.
This rule does not apply the moment either condition fails: a third matched
term (lease, landlord, guaranty, CMBS, shopping center, hotel, office
building, zoning, receiver, easement, etc.), or any business-entity name on
either side -- a bank foreclosing on an LLC-owned property, or a commercial
guaranty fight, is exactly the kind of case this site exists to cover, and
needs a real read like any other lead.

## Opinion leads with only generic business-document terms: skim before reading in full (added 2026-11-03)

Checking today's live ops/opinion-leads.json against ops/leads-handled.json's
recorded outcomes: three leads whose `matchedTerms` consisted *entirely* of
generic financing/deal vocabulary -- `developer`, `guarantor`, `guaranty`,
`purchase and sale agreement` -- with no real-estate-specific term also
present, all turned out not to be commercial real estate at all: Accelerant
Twister, LLC v. Marjo, LLC (`["developer","guarantor","guaranty"]` -- a
cannabis cone-rolling machine company governance dispute), Four Dimensions,
Inc. v. Wang (`["developer","industrial"]` -- a semiconductor company
acquisition dispute), and Camo Disposal Company, LLC v. Nelson Mullins Riley
& Scarborough, LLP (`["guarantor","purchase and sale agreement"]` -- a legal
malpractice suit over an unrelated failed deal). These terms show up in
ordinary M&A/financing documents across every industry, not just CRE, so on
their own they are a weak signal -- unlike a real-estate-specific term
(landlord, lease agreement, leased premises, commercial lease, commercial
property, shopping center, zoning, site plan, variance, nonconforming use,
easement, condemnation, eminent domain, foreclos, mortgage, deed of trust,
real property tax, hotel, industrial site/zoning context, office building,
CMBS), which still needs a real read.

This is only 3 cases, not the 12+ the foreclosure rule above was built on, so
this is guidance to skim first, not a skip-without-reading rule: when a
lead's `matchedTerms` are drawn *only* from `developer`, `guarantor`,
`guaranty`, `purchase and sale agreement` or `receiver`, with none of the
real-estate-specific terms above also present, read the case name and the
opinion's first page or two before deciding whether the full text is worth
reading -- don't assume it's CRE just because a financing-sounding term
matched. If a future run finds this shape producing a real CRE matter, note
it here so the rule can be loosened or dropped rather than silently ignored.

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

## Related-entity bankruptcy clusters: research once, remember the case (added 2026-10-29)

ops/leads-handled.json shows the "5 Star Tech I/II PropCo/HoldCo/L5" debtors
(7 Chapter 11 petitions, all Southern District of Texas) independently
researched and skipped on three separate days -- 2026-10-25, 2026-10-26 and
2026-10-27 -- each time starting from scratch, because each day's run saw
them under a different docket URL or filing number and had no record that
they were the same already-resolved cluster. By the third pass the research
had correctly worked out that these are additional debtors joining an
already-filed, jointly-administered Chapter 11 case (25-90607, tied to a
large existing loan) with no new dispute to report -- a conclusion the first
two passes could each have reached with one search, not several, and across
all three passes 21 separate lookups were spent reaching the same
conclusion about the same 7 underlying entities.

When several petitions filed the same day share one of these shapes --
near-identical debtor names (a base name with "I"/"II", "PropCo"/"HoldCo"/
"OpCo"/a numbered suffix), or the docket itself names a jointly-administered
lead case number -- do ONE search covering the base entity/sponsor name for
the whole group, not one search per debtor. If that search shows they are
additional debtors joining an already-filed case with no new story (the
usual outcome), skip the whole group, but put the shared lead case number
or sponsor name in every one of those entries' ops/leads-handled.json
"action" text, not just the docket URL -- that's what lets a future run
that sees the same cluster resurface under a new filing number recognize it
by the case number instead of re-researching it. This doesn't remove
anything from the site: scripts/ingest_court_filings.py's own pipeline
already gives every one of these debtor filings its own record page
regardless of whether the digest writes a narrative about them, the same
as the bare-docket guidance above.

## SEC quarterly litigation re-disclosures: record the case by name, not just the filing (added 2026-11-09)

scripts/pull_leads.py already tries to stop the same company's same lawsuit
from coming back as a lead every quarter: it extracts a "Party v. Party"
court caption from the excerpt and, once that caption is on file for a
company's CIK, skips a later filing that repeats it. But that only works
when the filing's own text uses a formal caption. Checked today's live
ops/sec-litigation-leads.json (44 leads, mostly from the Sept 30, 2026
quarter-end 10-Qs/10-Ks filed 2026-11-06/07): 36 of 44 (82%) have
`captions: []` -- companies very often describe ongoing litigation by an
informal name instead ("the Broadmark State Court Litigation," "the
Broadmark Federal Court Litigation," "the Frank Gardner Derivative
Litigation," "the Aquino Action") or the excerpt isn't a lawsuit at all
(a deed-in-lieu-of-foreclosure workout, a loan-payable accounting note, a
solvency representation in a contract exhibit) -- none of which the
CAPTION pattern can find. Every one of today's 36 was correctly read and
skipped as "no new development" or "not actually a litigation disclosure,"
but because none produced a caption, the per-company dedup never engages:
the identical disclosure will resurface under next quarter's filing (a new
accession number, so pull_leads.py's own key-based de-dup doesn't catch it
either) and need the same full read again -- the same wasted-repeat-research
shape the bankruptcy-cluster guidance above fixed, just on a ~90-day cycle
instead of a daily one, so it won't show up as repeated same-day lookups
the way that one did.

When an SEC-filing litigation lead is skipped as "no new development" or
"not actually litigation" (a workout, an accounting note, boilerplate
contract language), put a short, stable identifier in the
ops/leads-handled.json skip's own action text: the company name plus
whatever informal name the filing itself gives the matter (e.g. "Ready
Capital / Broadmark State Court Litigation," "UDR / [ticker] deed-in-lieu
workout," "Hartman vREIT XXI / Frank Gardner derivative suit"), not just
the filing's key or URL. Before spending a full read on a new SEC
litigation lead, check whether the same company (by name or CIK) already
has a skip recorded under the same or a closely matching informal name; if
so, a quick check of whether the dollar figure, status or date actually
moved is enough to confirm "still no new development" -- don't re-derive
that conclusion from nothing. This doesn't change what gets published or
skipped for any individual filing, only how much reading it takes to reach
the same answer the second and third time a quarter's disclosure repeats
itself.

## What we have learned

<!-- The self-improvement routine adds dated lines here: what changed in the digest's guidance and what happened to the news metrics afterwards. -->
- 2026-11-09: News is "on track" (gap 0.0) and sourcedMatters7/freshSourcedMatters7/medianDaysEventToAdded already has an open watching entry (imp-052, until 2026-11-10), so this run worked leadsToMattersTotal/leadsReviewedTotal instead, same as 2026-10-29's imp-041. Tallied the last 3 days of ops/leads-handled.json (67 entries, 61 skips) and found 28 "other" skips beyond the three already-addressed shapes (bare-docket, residential-foreclosure, generic-financing-term) -- nearly all from this quarter's SEC 10-Q/10-K wave (Sept 30, 2026 quarter-end, filed 2026-11-06/07), correctly skipped the same day as "no new development this filing" or "not actually a litigation disclosure." Checked why pull_leads.py's own per-company caption dedup (the mechanism that already stops a repeated lawsuit caption from resurfacing) didn't catch any of them before they were even added as leads: of the 44 SEC leads currently on file, 36 (82%) have `captions: []` -- the CAPTION regex only matches a formal "Party v. Party" string, and most of these disclosures name the matter informally ("the Broadmark State Court Litigation," "the Frank Gardner Derivative Litigation") or aren't a lawsuit at all (a deed-in-lieu workout, an accounting note). Did not touch scripts/pull_leads.py itself -- a regex broad enough to catch these informal names risks suppressing a genuinely new, differently-named dispute at the same company, and the actual skip decision already happens correctly today; the only cost is re-deriving the same "no new development" conclusion from scratch next quarter. Added a lower-risk, text-only fix instead: a new ops/digest-playbook.md section directing the digest to record the company + informal case name in ops/leads-handled.json's skip text (the exact pattern imp-041's cluster guidance already uses) so a future quarter's re-appearance can be confirmed quickly instead of re-researched. Watching news.metrics.leadsToMattersTotal/leadsReviewedTotal at checkAfter 2026-11-23 (14 days, same search-effort-allocation metric imp-041 used) -- but flagging honestly that the real test is the *next* SEC quarterly filing wave (~90 days out, around February 2027), not this window; a 14-day read here is unlikely to show anything either way.
- 2026-10-29: News already reads "on track" (gap 0.0: sourcedMatters7/freshSourcedMatters7/medianDaysEventToAdded 28/20/4.0), and imp-030 (2026-10-24) already has an open watching entry on all three of those metrics until 2026-10-31. goals.json's news section also scores leadsToMattersTotal/leadsReviewedTotal, which nothing is currently watching, so this run worked that metric instead of re-touching the three blocked ones. Tallied the last 10 days of ops/leads-handled.json's skip reasons (166 entries, 156 skips) and found the single biggest reason (34 of 156, plus related variants) is still the already-addressed "no coverage found" bare-docket shape from G16/the "Bare court-docket leads" section above -- but a second, narrower pattern stood out: the "5 Star Tech I/II PropCo/HoldCo/L5" cluster (7 related Chapter 11 debtors in one jointly-administered case) was independently researched and skipped on 2026-10-25, 2026-10-26 and 2026-10-27 -- three full passes reaching the same "no new story, additional debtor in an existing case" conclusion, 21 lookups total for one underlying fact. Added a new section ("Related-entity bankruptcy clusters: research once, remember the case") directing one search per cluster instead of one per debtor, and recording the shared case number in ops/leads-handled.json's action text so a future run recognizes a resurfacing cluster by case number rather than re-researching it. Watching news.metrics.leadsToMattersTotal/leadsReviewedTotal (baseline 31/297) at checkAfter 2026-11-05 (14 days, since this is about search-effort allocation across many runs, not a single day's output) -- a real move would be leadsReviewedTotal growing more slowly relative to leadsToMattersTotal than it has been, i.e. less review effort spent per matter produced; if it doesn't move, the cluster shape may simply be too rare (one 7-debtor cluster in 10 days) to show up in an aggregate count, which wouldn't mean the guidance is wrong.
- 2026-10-13: Starting point. Week of 2026-10-06: 23 sourced matters, 5 within 7 days of the event, median 97 days from event to publication; 14 of 15 leads skipped. Record-only petition matters were banned on 2026-10-12.
- 2026-10-17: The news goal (ops/metrics/goals.json) now reads "on track" (gap 0.0): 50 sourced matters in the last 7 days, 41 of them fresh, median 5.0 days event-to-publication -- all past target, and backlog item G1 (added 2026-10-13, asking for exactly this fix) is done; marked struck in ops/improvement-playbook.md's backlog. Looked for patterns in the skip reasons as G1 also asked: of 101 leads logged 2026-10-08 through 2026-10-17, 85 were skipped and 30 of those (35%) were bare court-docket leads (small Chapter 11 petitions, small LLC-vs-insurer federal suits) with no secondary reporting to write a narrative matter from -- confirmed these still get their own page automatically via the separate ingest/record-page pipeline, so the skip is not a real coverage loss. Added guidance above ("Bare court-docket leads with no coverage") to spend one targeted search on these rather than several variants, and put the saved effort toward opinion/SEC/trade-press leads, which is where matters actually come from. Watching sourcedMatters7/freshSourcedMatters7/medianDaysEventToAdded (baseline 50/41/5.0) for 7 days to confirm this doesn't regress the pipeline that got the goal on track.
- 2026-10-24: Judged by the self-improvement routine (not this file's own run): sourcedMatters7/freshSourcedMatters7 dropped from the 2026-10-17 baseline of 50/41 to 27/25 by 2026-10-24, a 46%/39% decline that would clear the "hurt" threshold on its own. Traced the cause before concluding anything about the 2026-10-17 change: reconstructing the same rolling 7-day window day by day from js/data.js shows sourcedMatters7 was 50-55 for 2026-10-17 through 2026-10-20, then dropped to 27-32 from 2026-10-21 onward -- and js/data.js shows a one-time batch of 28 matters added on 2026-10-13 alone (every other day in October added 1-8). That spike was still inside the trailing 7-day window through 2026-10-19/20 and aged out by 2026-10-21, which fully explains the drop in the window total without any change in the digest's day-to-day output. Verdict: **no clear effect** from the 2026-10-17 change -- the apparent regression is a measurement artifact of a one-time backfill leaving the 7-day window, not evidence that spending less search effort on bare docket leads hurt sourcing. Separately, found the single biggest recurring opinion-lead skip reason (12+ of the last 10 days' skips, all "residential mortgage foreclosure appeal, individual defendant") shares one exact fingerprint every time: `matchedTerms` of precisely `["foreclos","mortgage"]` and a `caseName` with no business-entity suffix on the defendant side. Added a new section above ("Residential mortgage foreclosure opinions: skip without reading") so the digest can skip this shape from the lead's own metadata instead of reading the full opinion text each time, freeing that reading budget for opinion leads more likely to be real commercial matters. Watching sourcedMatters7/freshSourcedMatters7/medianDaysEventToAdded (baseline 27/25/3) for 7 days -- a real test here is whether this frees enough effort to push sourcedMatters7 back toward the 50+ range once the 2026-10-13 batch's distortion is fully gone from the window, not just "does it avoid a drop."
