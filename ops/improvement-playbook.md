# CREdocket self-improvement playbook

The daily self-improvement routine reads this file every run and may edit the
"What we have learned" and "Backlog" sections. Everything above "What we have
learned" is set by Jeff (through a session with Claude) and the routine must
not change it. CLAUDE.md's hard boundaries always win over anything here.

## Mission

Make credocket.com more useful to commercial real estate professionals every
day, one measured change at a time, so more visitors find what they came for,
read a second page, follow a case or sign up. The site is small (about 100
visits a day in October 2026, most from Google landing on one matter page), so
prefer changes whose value is clear without a statistical test: findability,
internal links, page quality, accuracy, speed and clarity.

## What the routine may change

- Root HTML pages' copy, layout and links (not legal text: privacy, terms,
  disclaimers, methodology claims about legal standards).
- css/styles.css, js/main.js, js/matter-page.js, js/search.js, js/trending.js.
- Page builders and their outputs: scripts/build_matter_pages.ts,
  scripts/build_record_pages.ts, scripts/prerender.ts, scripts/build_sitemap.py
  (the prerender workflow rebuilds the pages after a push that changes them).
- scripts/site_audit.py (to add a check), ops/improvement-playbook.md (the
  two sections below), ops/improvement-log.json.

## What the routine must never change

- CLAUDE.md, anything under .github/, supabase/ (functions and migrations
  cannot be deployed from the cloud anyway), case_valuation_project/.
- js/auth.js, js/supabase-client.js, js/track.js, js/case-valuation*.js,
  js/lease-clause-redline.js, anything about pricing, Stripe, plans or
  FREE_MODE.
- js/data.js matter content and js/corrections.json (the digest routine owns
  published facts; corrections follow CLAUDE.md's rules).
- ops/ data files written by other jobs.
- No new features that need a backend, accounts, payments, a public API or
  personal data. No auto-valuation of tracker matters. Nothing residential
  and no debt collection. Never an individual's name from court records.
- No destructive git: no force push, no history rewrite. Undo a change with
  `git revert <sha>` (a new commit).

## How to judge a change

- Log the metric it should move and its baseline from ops/metrics/latest.json
  (7- or 28-day window), and a check date at least 7 days out (14 for anything
  depending on Google). Audit fixes are judged by the next day's audit count.
- With this little traffic, call a change "helped" or "hurt" only when the
  7-day number moves by 25% or more and the 28-day trend agrees; otherwise
  "no clear effect". Keep "no clear effect" changes that are plainly good for
  readers (accuracy, broken links, clarity); revert ones that added clutter.
- Never revert someone else's change (only entries in ops/improvement-log.json).

## What we have learned

<!-- The routine adds one dated line per verdict: what it changed, what happened, what to do next time. -->
- 2026-10-08: Starting point. 7-day window: 485 visits, 15 multi-page visits, 3 sign-ins, 0 searches, 0 newsletter sign-ups. Google landings go to single matter pages about specific businesses; party cross-links, related lists and follow boxes were added 2026-10-06/07 and have not been measured yet.
- 2026-10-09: First run; improvement-log.json was empty, so nothing to judge yet. Fixed backlog item 1 (imp-001): companies.html and judges.html built their only links to the 34 company-*.html / 42 judge-*.html profile pages entirely in JavaScript, so site_audit.py (and any crawler that doesn't execute JS) saw those 76 pages as orphans. Added a plain static A-Z link list to each page. orphanPages dropped 92 -> 16 immediately (confirmed by re-running site_audit.py before committing), so this is judged by the next day's audit count per "How to judge a change," not a 7/28-day traffic window. Next time: the remaining 16 orphans are a different shape (state-guide and standalone pages, not JS-rendered lists) -- added as a new backlog item below rather than folded into this one.
- 2026-10-09 (second run): imp-001's checkAfter is 2026-10-10, so nothing to judge yet this run. Fixed backlog item 2 (imp-002), confirming the hunch that state-guides.html's state picker is JS-built the same way companies.html/judges.html were: added a static link list for the 13 state-guide pages. The other 3 orphans weren't that same shape -- author-jeff-novel.html and newsletter.html had zero inbound links anywhere, so added one each (an About-page author blurb, a homepage newsletter-band link); handbook.html is a pure redirect stub with its own canonical pointing elsewhere, so marking it noindex and dropping it from the sitemap was the honest fix rather than inventing a backlink to it. orphanPages 16 -> 0, confirmed by re-running site_audit.py --print before committing. Next time: if a future audit snapshot shows orphanPages back above 0, check whether it's a newly-added page of one of these shapes before assuming a new fix is needed.
- 2026-10-10: Judged imp-001 and imp-002 (both checkAfter 2026-10-10; no fresh ops/metrics snapshot had landed yet, so judged against a live site_audit.py run instead, as the playbook's "audit fixes judged by the next day's audit count" calls for). imp-001 (baseline orphanPages 92): **helped** -- today's live count is 1, a 98%+ drop; the lone remaining orphan is judge-frank-volk.html, a judge added to js/data.js after imp-001 shipped, not a return of the original 92. imp-002 (baseline 16): **helped** -- its own targets (state guides, author bio, newsletter, handbook) are all still linked; today's one orphan is outside its scope. This confirmed Jeff's backlog item 0 concern exactly as written: the hand-written A-Z lists go stale the moment the digest adds a new party or judge. Fixed it (imp-003): moved both lists into scripts/prerender.ts, generated from RELAW_DATA.trackedParties / RELAW_DATA.judges and filtered to slugs whose profile page actually exists, so a future addition links itself automatically. orphanPages confirmed back to 0 by a live site_audit.py run before committing. Next time: don't hand-edit these two lists again -- if orphanPages shows a company-*.html or judge-*.html page, check that the profile page file itself exists (prerender only links pages that do) before assuming the generator broke.

## Backlog

<!-- Ranked ideas. The routine works from the top, adds ideas with the evidence for them, and strikes items it finishes (link the log id). -->
0. ~~(Added by Jeff's session, 2026-10-09) imp-001's A-Z lists in companies.html and judges.html are hand-written, so a company or judge the digest adds later will be orphaned again. Move them into scripts/prerender.ts (it already bakes company matter lists) between marker comments, generated from RELAW_DATA.trackedParties and RELAW_DATA.judges, so they stay complete automatically.~~ Done 2026-10-10, imp-003: confirmed by the live audit (judge-frank-volk.html orphaned) before fixing; both lists now generated in scripts/prerender.ts and filtered to slugs with an existing profile page.
1. ~~Company and judge profile pages are reachable only through JavaScript-built lists (site_audit "orphanPages": 92 on 2026-10-08). Bake static links to every company-*.html and judge-*.html into companies.html and judges.html (the prerender step already bakes company matter lists) so crawlers find them.~~ Done 2026-10-09, imp-001: static A-Z link lists added to both pages; orphanPages 92 -> 16.
2. ~~16 orphan root pages remained after imp-001: author-jeff-novel.html, handbook.html, newsletter.html, and 13 state-guide pages.~~ Done 2026-10-09, imp-002: static link list added to state-guides.html (same JS-built-picker shape as imp-001); one inbound link each added for author-jeff-novel.html (from about.html) and newsletter.html (from index.html); handbook.html marked noindex and dropped from sitemap.xml since it's a pure redirect stub. orphanPages 16 -> 0.
3. Homepage and litigation.html do not link to Federal Lawsuit Watch or Chapter 11 Watch outside the menu. Add a compact "From the court record today" block (newest petitions and federal cases, linking their pages), built at prerender time so the numbers are always literally right.
4. Matter pages: link a matter to its Chapter 11 or federal-case page when the docket or debtor matches (build_matter_pages.ts can read ops/ch11-petitions.json and ops/federal-suits.json).
5. Two pages lack a meta description and ten are weak (site_audit "missingDescription", "weakDescription"); fix the root pages' copy (record pages are generated; fix the builder).
6. Search had 0 uses in 7 days. Make the site search more visible on litigation.html and matter pages, then watch "searches".
7. Newsletter sign-ups were 0 after launch. Try a clearer offer near the end of matter pages ("Every Monday: the week's new commercial real estate lawsuits") and watch "newsletterSignups".
8. Follow boxes: watch "follows" and the docket_follow event after two weeks; if near zero, test plainer copy or placement above the write-up preview.
9. Page speed: check the heaviest root pages and images (site_audit "heavyPages"), lazy-load below-the-fold images, and keep data-lite.js out of pages that do not need it.
