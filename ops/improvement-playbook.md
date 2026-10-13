# CREdocket self-improvement playbook

The self-improvement routine reads this file every run and may edit only the
"What we have learned" and "Backlog" sections. Everything above them is set by
Jeff (through a session with Claude). CLAUDE.md's hard boundaries always win.

## Mission and goals (rewritten 2026-10-13)

Jeff, 2026-10-13: the improvement loop was doing site housekeeping while the
real goals stood still. Every run now works toward one of five goals, scored
daily in ops/metrics/goals.json (scripts/goal_scoreboard.py; targets live in
its TARGETS table):

1. **Traffic**: more people find the site (7-day visits, Google landings).
2. **Conversion**: visitors come back (sign-ups, case follows, newsletter
   sign-ups, visits that read a second page).
3. **News feed**: the tracker carries fresh, sourced, useful write-ups (sourced
   matters per week, how many are within 7 days of the event, median days from
   event to publication, how many leads become matters).
4. **Calculator**: the Case Value Calculator is accurate and used (backtest range
   hit rate after appeal, calculator page views).
5. **Subscription readiness**: the paid product is worth paying for (checklist
   below). Pricing, plans, billing and Stripe are Jeff's alone; this goal is
   about the product.

## How to choose the work

- Read ops/metrics/goals.json. Work on the goal in "mostBehind" order, but
  every goal must get at least one change every 7 days (count the "track" field
  in ops/improvement-log.json). Site-audit breakage (broken links, missing
  titles, pages that fail to load) still comes first when it exists.
- Prefer the change with the biggest expected effect on that goal's metric, not
  the easiest one. A housekeeping fix is right only when nothing larger is
  possible this run.
- Record "track" (traffic | conversion | news | calculator | subscription |
  audit) in every log entry.

## What each goal's work can include

- **Traffic**: pages people search for, built from data the site already has
  (topic and state hub pages, a monthly "commercial real estate bankruptcies
  and lawsuits" data report built at prerender time so every number is
  literally true); titles and descriptions written for searchers; internal
  links from high-traffic pages; weekly LinkedIn post drafts in
  ops/social-drafts/<date>.md for Jeff to post (never post anything yourself).
- **Conversion**: wording, placement and visibility of the follow box,
  newsletter offer and sign-in prompt; reasons to come back (what's new since
  your last visit); making the most-visited pages lead somewhere.
- **News feed**: edit ops/digest-playbook.md, which the twice-daily digest
  routine reads every run: search angles, sources, priorities, how to turn
  leads into write-ups. It may tighten but never loosen CLAUDE.md or the digest
  prompt (sourcing, scope, no individuals, no record-only matters). Improve lead
  quality in scripts/pull_leads.py and the is_cre_suit / is_cre_debtor name
  lists in scripts/ingest_court_filings.py (test against the saved ops/ files
  before committing).
- **Calculator**: the valuation method (prompt, math, rules in
  supabase/functions/case-valuation-analyze/) changes only with Jeff's approval
  and cannot be deployed from the cloud. So: run free experiments by replaying
  saved backtest runs (scripts/replay_backtest.py), find where and why ranges
  miss, and write the evidence and a proposed change to
  ops/calculator-proposals.md marked NEEDS JEFF. Also improve
  case-valuation.html and the methodology/backtest pages for clarity and
  findability (copy, examples, links from matter pages), so people use it.
- **Subscription readiness** (Jeff's priorities in CLAUDE.md: feature gaps,
  monitoring reliability, data depth, procurement terms). Checklist:
  1. Monitor and alerts explained with a sample alert email and a sample
     portfolio report on the product pages.
  2. A plain data-sources and accuracy page buyers' compliance teams can read
     (what is covered, how often, known gaps, corrections log).
  3. Procurement terms: security and privacy summary, data retention, how to
     cancel; no prices.
  4. Monitoring reliability shown publicly (the alert log, uptime of the daily
     jobs).
  5. Coverage depth stated honestly by state and court.
  Build or improve one item per run; anything needing a backend, accounts,
  payment, a public API or a legal judgment goes to the backlog as NEEDS JEFF.

## What the routine may change

- Root HTML pages' copy, layout and links (not legal text: privacy, terms,
  disclaimers, and statements about legal standards).
- css/styles.css, js/main.js, js/matter-page.js, js/search.js, js/trending.js.
- Page builders and their outputs: scripts/build_matter_pages.ts,
  scripts/build_record_pages.ts, scripts/prerender.ts, scripts/build_sitemap.py.
- scripts/site_audit.py, scripts/goal_scoreboard.py (metrics only, not the
  targets), scripts/pull_leads.py, the name lists in
  scripts/ingest_court_filings.py.
- ops/digest-playbook.md, ops/calculator-proposals.md, ops/social-drafts/,
  ops/improvement-log.json and this file's two lower sections.

## What the routine must never change

- CLAUDE.md, anything under .github/, supabase/, case_valuation_project/data/.
- js/auth.js, js/supabase-client.js, js/track.js, js/case-valuation*.js,
  js/lease-clause-redline.js, anything about pricing, Stripe, plans or FREE_MODE.
- js/data.js matter content and js/corrections.json (the digest routine owns
  published facts; corrections follow CLAUDE.md).
- ops/ data files written by other jobs.
- No public or self-serve API, no auto-valuation of tracker matters, nothing
  residential, no debt collection, never an individual's name from court
  records, never a fabricated fact, figure or quote.
- No destructive git. Undo a change with `git revert <sha>` (a new commit).

## How to judge a change

- Log the metric it should move, its baseline from ops/metrics/latest.json or
  goals.json, and a check date (next day for audit fixes, 7 days for page and
  news changes, 14 for anything depending on Google).
- With this little traffic, call a change "helped" or "hurt" only when the
  7-day number moves by 25% or more and the 28-day trend agrees; otherwise "no
  clear effect". Keep plainly good changes; revert ones that added clutter.
- Never revert someone else's change (only entries in ops/improvement-log.json).
- The routine runs twice a day (15:30 and 03:30 UTC) but ops/metrics/ is written
  once a day (14:41 UTC). Start every run with `python3 scripts/site_audit.py
  --print` and `python3 scripts/goal_scoreboard.py` for current numbers. Two
  changes in one day share one measurement window: say so in the second entry.

## What we have learned

<!-- The routine adds one dated line per verdict: what it changed, what happened, what to do next time. -->
- 2026-10-08: Starting point. 7-day window: 485 visits, 15 multi-page visits, 3 sign-ins, 0 searches, 0 newsletter sign-ups. Google landings go to single matter pages about specific businesses; party cross-links, related lists and follow boxes were added 2026-10-06/07 and have not been measured yet.
- 2026-10-09: First run; improvement-log.json was empty, so nothing to judge yet. Fixed backlog item 1 (imp-001): companies.html and judges.html built their only links to the 34 company-*.html / 42 judge-*.html profile pages entirely in JavaScript, so site_audit.py (and any crawler that doesn't execute JS) saw those 76 pages as orphans. Added a plain static A-Z link list to each page. orphanPages dropped 92 -> 16 immediately (confirmed by re-running site_audit.py before committing), so this is judged by the next day's audit count per "How to judge a change," not a 7/28-day traffic window. Next time: the remaining 16 orphans are a different shape (state-guide and standalone pages, not JS-rendered lists) -- added as a new backlog item below rather than folded into this one.
- 2026-10-09 (second run): imp-001's checkAfter is 2026-10-10, so nothing to judge yet this run. Fixed backlog item 2 (imp-002), confirming the hunch that state-guides.html's state picker is JS-built the same way companies.html/judges.html were: added a static link list for the 13 state-guide pages. The other 3 orphans weren't that same shape -- author-jeff-novel.html and newsletter.html had zero inbound links anywhere, so added one each (an About-page author blurb, a homepage newsletter-band link); handbook.html is a pure redirect stub with its own canonical pointing elsewhere, so marking it noindex and dropping it from the sitemap was the honest fix rather than inventing a backlink to it. orphanPages 16 -> 0, confirmed by re-running site_audit.py --print before committing. Next time: if a future audit snapshot shows orphanPages back above 0, check whether it's a newly-added page of one of these shapes before assuming a new fix is needed.
- 2026-10-10: Judged imp-001 and imp-002 (both checkAfter 2026-10-10; no fresh ops/metrics snapshot had landed yet, so judged against a live site_audit.py run instead, as the playbook's "audit fixes judged by the next day's audit count" calls for). imp-001 (baseline orphanPages 92): **helped** -- today's live count is 1, a 98%+ drop; the lone remaining orphan is judge-frank-volk.html, a judge added to js/data.js after imp-001 shipped, not a return of the original 92. imp-002 (baseline 16): **helped** -- its own targets (state guides, author bio, newsletter, handbook) are all still linked; today's one orphan is outside its scope. This confirmed Jeff's backlog item 0 concern exactly as written: the hand-written A-Z lists go stale the moment the digest adds a new party or judge. Fixed it (imp-003): moved both lists into scripts/prerender.ts, generated from RELAW_DATA.trackedParties / RELAW_DATA.judges and filtered to slugs whose profile page actually exists, so a future addition links itself automatically. orphanPages confirmed back to 0 by a live site_audit.py run before committing. Next time: don't hand-edit these two lists again -- if orphanPages shows a company-*.html or judge-*.html page, check that the profile page file itself exists (prerender only links pages that do) before assuming the generator broke.
- 2026-10-11: Judged imp-003 (checkAfter 2026-10-11, no fresh snapshot yet so judged live, same substitution rule as 2026-10-10): **helped** -- live site_audit.py shows orphanPages at 0 despite freshness.matters rising 232 -> 242 (new judges/companies since imp-003 shipped would have re-orphaned under the old hand-written lists; they didn't). Then looked at audit.json's weakDescription list (10 pages, several with absurdly low char counts: live-137 at 2 chars, live-203 at 11) and found the real cause wasn't thin content -- `grep -rl 'content="[^"]*<meta ' matters/ chapter-11/ federal-cases/` showed 31 published pages with a second `<meta name="description" content="...">` fragment spliced into the first one's attribute value. Root cause: build_matter_pages.ts/build_record_pages.ts build these tags with `.replace(regex, templateString)` using a literal "$1" to reinsert the matched opening tag, but "$1" is special to String.replace -- a summary containing a dollar figure like "$170M" gets its digit read as a second backreference. Fixed (imp-004) by switching every such .replace() call in both builders, plus the same pattern in prerender.ts's setText() (latent, not yet triggered), to replacement functions, which return their string verbatim. Not hand-baked: both builders are in prerender.yml's trigger-path list, so this push regenerates every matter/chapter-11/federal-case page. Confirmed same-day rather than waiting for checkAfter: the prerender workflow rebuilt every matter/record page within minutes of the push, and a live site_audit.py run showed weakDescription drop 10 -> 3, with the remaining 3 being exactly contact.html/handbook-success.html/reset-password.html -- **imp-004 helped**. Next time: the 3 truly-thin-content pages above and the 2 missingDescription pages (admin-settlement-review.html, handbook.html, both already noindex) are a separate, still-open issue, not touched by this fix.
- 2026-10-12: Nothing to judge this run -- imp-004's checkAfter was today, but its verdict was already recorded same-day on 2026-10-11 (the unambiguous same-day case the playbook allows). Live site_audit.py confirmed every summary count unchanged/stable from yesterday's snapshot otherwise. Fixed the 3 pages imp-004 left open (imp-005): contact.html (37 chars, and indexable -- the one with real SEO stakes), handbook-success.html (65 chars, noindex) and reset-password.html (46 chars, noindex) all had genuinely thin hand-written meta descriptions, not a builder bug. Wrote real copy for each grounded in the page's own actual content (verified by reading each page's h1/lede, not invented) between 120-152 chars. Live site_audit.py: weakDescription 3 -> 0, no other count regressed. Next time: backlog item 5 is now fully closed (both the builder bug and the genuinely-thin pages); if weakDescription reappears, check whether it's a new page with thin boilerplate copy rather than assuming the old builder bug returned.
- 2026-10-12 (second run): imp-005's checkAfter is 2026-10-13, so nothing to judge yet. Live site_audit.py was already fully clean (brokenLinks/orphanPages/weakDescription all 0, the 2 missingDescription pages both noindex), so moved to the top open backlog item: imp-006 added a "From the court record" block to index.html and litigation.html linking the 3 newest Chapter 11 petitions and 3 newest federal suits to their own record pages, plus "See all N" links to bankruptcy-watch.html/lawsuit-watch.html -- both pages previously reached only through the nav dropdown. Verified every linked record-page file actually exists before baking the links, and re-ran site_audit.py after (brokenLinks still 0). Generated in scripts/prerender.ts (deno unavailable this session, so hand-baked the current output into both pages too, same as imp-001/002/003; prerender.yml watches prerender.ts and will regenerate both pages from live data after this push). Next time: judge imp-006 against last7Days.multiPageRate at checkAfter (2026-10-19); if it doesn't move, consider the block isn't visible enough rather than that the idea is wrong (backlog items 6-9 note the same pattern -- new internal surfaces this site has added rarely show up in a 7-day window given ~260 weekly visits).

## Backlog

<!-- Ranked ideas. The routine works from the top, adds ideas with the evidence for them, and strikes items it finishes (link the log id). -->
G1. (Goal: news; added 2026-10-13) Last week's matters were published a median 97 days after the event and only 5 of 23 were within 7 days; 14 of 15 leads were skipped. Rewrite ops/digest-playbook.md priorities so each run starts from same-week sources (court opinion releases, federal suits filed this week, SEC filings this week) and records why each lead was skipped; then look for patterns in the skip reasons.
G2. (Goal: calculator; added 2026-10-13) The calculator had 0 page views in 7 days. Link it from every matter page where it applies (a "What is a case like this worth?" box pointing to case-valuation.html with the matter's category), and from the homepage.
G3. (Goal: calculator; added 2026-10-13) v4.3's range contains the final outcome in 53% of resolved backtest cases (target 75%). Replay the saved runs to find which claim types and rules cause the misses; write the evidence and a proposed change in ops/calculator-proposals.md (NEEDS JEFF).
G4. (Goal: traffic; added 2026-10-13) Build a monthly "Commercial real estate bankruptcies and lawsuits" report page at prerender time from ops/ch11-petitions.json and ops/federal-suits.json (counts by state, property type words and court, with every number computed, never typed), a page reporters and LinkedIn readers can cite.
G5. (Goal: traffic; added 2026-10-13) Draft this week's LinkedIn posts for the CREdocket page from the newest sourced matters in ops/social-drafts/ (Jeff posts them).
G6. (Goal: conversion; added 2026-10-13) 0 follows and 0 newsletter sign-ups in 7 days. Put one clear call to action above the write-up preview on matter pages (follow the case when it has a docket, otherwise the Monday email) and watch follows7 and newsletterSignups7.
G7. (Goal: subscription; added 2026-10-13) Checklist item 1: sample alert email and sample portfolio report on the Monitor page, built from real public data only.
0. ~~(Added by Jeff's session, 2026-10-09) imp-001's A-Z lists in companies.html and judges.html are hand-written, so a company or judge the digest adds later will be orphaned again. Move them into scripts/prerender.ts (it already bakes company matter lists) between marker comments, generated from RELAW_DATA.trackedParties and RELAW_DATA.judges, so they stay complete automatically.~~ Done 2026-10-10, imp-003: confirmed by the live audit (judge-frank-volk.html orphaned) before fixing; both lists now generated in scripts/prerender.ts and filtered to slugs with an existing profile page.
1. ~~Company and judge profile pages are reachable only through JavaScript-built lists (site_audit "orphanPages": 92 on 2026-10-08). Bake static links to every company-*.html and judge-*.html into companies.html and judges.html (the prerender step already bakes company matter lists) so crawlers find them.~~ Done 2026-10-09, imp-001: static A-Z link lists added to both pages; orphanPages 92 -> 16.
2. ~~16 orphan root pages remained after imp-001: author-jeff-novel.html, handbook.html, newsletter.html, and 13 state-guide pages.~~ Done 2026-10-09, imp-002: static link list added to state-guides.html (same JS-built-picker shape as imp-001); one inbound link each added for author-jeff-novel.html (from about.html) and newsletter.html (from index.html); handbook.html marked noindex and dropped from sitemap.xml since it's a pure redirect stub. orphanPages 16 -> 0.
3. ~~Homepage and litigation.html do not link to Federal Lawsuit Watch or Chapter 11 Watch outside the menu.~~ Done 2026-10-12, imp-006: added a "From the court record" block to both pages (3 newest Chapter 11 petitions, 3 newest federal suits, each linking its own record page, plus "See all N" to bankruptcy-watch.html/lawsuit-watch.html), generated in scripts/prerender.ts from ops/ch11-petitions.json and ops/federal-suits.json. Watching last7Days.multiPageRate (baseline 0.1034) for a week.
4. Matter pages: link a matter to its Chapter 11 or federal-case page when the docket or debtor matches (build_matter_pages.ts can read ops/ch11-petitions.json and ops/federal-suits.json).
5. ~~Two pages lack a meta description and ten are weak (site_audit "missingDescription", "weakDescription").~~ Done 2026-10-11/12, imp-004 + imp-005: the 7 matter-page entries were a builder bug (dollar-figure text corrupting the meta tag), fixed at the source in imp-004; the remaining 3 (contact.html, handbook-success.html, reset-password.html) had genuinely short hand-written descriptions, replaced with real copy in imp-005. weakDescription 10 -> 0. The 2 missingDescription pages (admin-settlement-review.html, handbook.html) are both already noindex, so left alone -- low priority, no visitor or search engine ever sees them.
6. Search had 0 uses in 7 days. Make the site search more visible on litigation.html and matter pages, then watch "searches".
7. Newsletter sign-ups were 0 after launch. Try a clearer offer near the end of matter pages ("Every Monday: the week's new commercial real estate lawsuits") and watch "newsletterSignups".
8. Follow boxes: watch "follows" and the docket_follow event after two weeks; if near zero, test plainer copy or placement above the write-up preview.
9. Page speed: check the heaviest root pages and images (site_audit "heavyPages"), lazy-load below-the-fold images, and keep data-lite.js out of pages that do not need it.
