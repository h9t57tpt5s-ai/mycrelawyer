# CREdocket newsroom brief (read fully before researching)

Used by the daily newsroom task (beat agents researching fresh matters; the editor publishes with scripts/add_matters.py). Lessons from editing are at the end.

CREdocket (credocket.com) is a commercial real estate (CRE) litigation intelligence site for owners, lenders, REITs, developers, asset managers and their lawyers. You are finding FRESH matters and writing publish-ready entries. Use today's date (UTC) when judging freshness. The site owner is a CRE litigator; quality and accuracy matter more than volume.

## What counts
- The legal EVENT (a lawsuit filed, a ruling, a settlement, a foreclosure/receivership action, a bankruptcy with real coverage, an appeal) happened within the last 7 days. Prefer the last 3 days. Report the event date exactly as the source states it.
- Commercial real estate on its face: a dispute about owning, financing, developing, leasing to businesses, operating, insuring or taking commercial property (office, retail, industrial, hotel, multifamily OWNER/operator business disputes, mixed-use, land, data centers, self-storage, senior living, medical office, life sciences).
- NOT: residential tenants/homeowners/consumers, 1-4 unit residential lending, rent-overcharge or habitability suits, debt collection, anything not about real estate. Borderline = leave it out.

## Hard rules
- Every fact, number, date, party and quote comes from a source you actually opened with WebFetch (or the browser if WebFetch is blocked). Search snippets alone are NOT enough. If you cannot open and read the source, drop the story.
- Never invent or estimate a figure. amountUsd only if a source states a dollar figure for this matter.
- Individuals (Jeff's rule, 2026-10-13): the "parties" list is business and government names only, always. In the title, summary and body you MAY name a well-known principal of a commercial real estate firm (a sponsor, developer, landlord or fund principal) when published reporting you opened names them in connection with the matter, because that name is what readers search for. Never name residential tenants, homeowners, consumers, employees, injured people, guarantors who are not well-known principals, or any individual taken only from a court-data feed or docket caption. When in doubt, use the company name or "the developer's principal".
- Do not copy sentences from the source article; write in your own words (short quoted phrases under 15 words are OK, at most one per entry).
- Check duplicates: read the existing-matters list the editor gives you (id | title | parties; built from js/data.js). Skip anything already covered, even under a different title.
- Do not create accounts, log in, solve CAPTCHAs, or submit forms. Skip paywalled sources you cannot read.
- Docket links: include "docketUrl" ONLY if you opened a case-specific docket page (CourtListener docket or opinion page for federal; NYSCEF only with an index number confirmed by a source). Never a generic search link.

## Accuracy rules from the November 16, 2026 audit (Jeff; read before writing)
An audit of 48 published write-ups sourced to The Real Deal found errors in nearly every one: owners and plaintiffs wrongly named, articles' publication dates used as filing dates, background the source does not contain, and almost no credit to the outlet. Every new entry must meet these rules; add_matters.py and check_case_fields.py refuse the mechanical ones.
- Only what your sources say, and no longer than they support. No background, history, motives, market color or "context" that is not in a source you opened. There is no word or paragraph target: a short source makes a short entry (two short paragraphs is fine), and the body never runs past 4 paragraphs. Never pad or exaggerate any description, summary, title or significance (Jeff, 2026-11-16: "under no circumstances should descriptions be padded or exaggerated").
- Credit the reporting in the text. When a fact comes from an article and not a court record, say so ("The Real Deal reported", "according to Crain's Chicago Business"). If the article credits another outlet, name that one too. Never credit an outlet you did not read.
- Check the article for a "Correction" or "Updated" note before writing, and follow the corrected version. Two of the worst errors (wrong owners of 10 East 34th Street and 1440 Broadway) were already corrected in the source.
- The event date is the filing or ruling date, not the article's publication date. Work it out from the article ("filed Tuesday" in an article dated Thursday, Nov. 5 means Nov. 3). If the source gives only a month, write the month in the text and timeline and never invent a day.
- Who did what, exactly as the source says: the plaintiff, the defendant, the owner, the lender and the court. Owners change; the borrower in a 2018 loan is not necessarily the company that bought the building in 2016.
- Attribute every allegation to whoever makes it ("the lender alleges", "the complaint says"). No labels on a company or person: not "troubled", "distressed", "embattled", "struggling", "notorious" or "walked away".
- Include the other side. If the source reports a denial, a response, a motion to dismiss or "did not respond", say so.
- Quotes from a complaint or a person go in quotation marks with attribution; otherwise use your own words.
- Timeline: date order, `current` on the latest event, and never mark a date that has passed as upcoming.
- Return a "factCheck" list with each entry: one item per figure, date, party name and court, each with the exact source sentence that states it ({"claim": ..., "quote": ..., "url": ...}). Copy the sentence character for character (at least a full clause). Anything you cannot quote, leave out. This is enforced: scripts/verify_matters.py opens every url and HOLDS the matter unless each quote is on its page, at least one quote is from the sourceUrl, every figure in the text appears in a quote, and every party name appears in a quote. An independent fact-checker (ops/fact-check-brief.md) then re-reads the sources and must pass the matter. Write so both checks pass: if a fact is not in a quote you can give, it does not go in the entry.

## Output: return ONLY a JSON array of matters (best first, 0-4 of them), each exactly:
{
 "title": "<Case name or plain headline; e.g. 'Acme Lender LLC v. 123 Main Owner LLC: $40M Office Loan Foreclosure Filed in Manhattan'>",
 "seoTitle": "<max 65 chars, for Google: lead with what people search -- the building or address, the known company/sponsor/lender, or the city -- then what happened. e.g. '123 Main Street Manhattan: $40M Office Foreclosure by Acme Lender'. Only names and figures from this entry.>",
 "seoDescription": "<120-155 chars: the same searchable names plus the key fact (who, what property, how much, what the court did).>",
 "property": {"name": "<property name or null>", "address": "<street address exactly as the source gives it, or null>", "city": "<city or null>", "state": "<two-letter>"}  (or null when the matter is not about one identifiable property),
 "category": "<one of: landlord-tenant, zoning-land-use, reit-securities, construction-defect, lending-foreclosure, environmental, eminent-domain, lease-disputes, premises-liability>",
 "status": "<one of: filed, pending, ruling, settled, appeal>",
 "date": "YYYY-MM-DD (the event date)",
 "jurisdiction": "<court name, e.g. 'U.S. District Court, Southern District of New York' or 'New York Supreme Court, New York County'>",
 "state": "<two-letter code>",
 "amount": "<short human phrase, e.g. '$40 million mortgage' or 'Injunctive relief'>",
 "sourceUrl": "<the best primary or most authoritative source you opened>",
 "brief": "<one or two sentences, 60-260 characters, shown above the write-up on tracker cards: who, what happened, the stake (property and dollar amount if stated). A reader scanning the tracker should know from this alone whether the case matters to them. Only facts and figures from this entry; don't repeat the title.>",
 "summary": "<2-4 sentences: what happened>",
 "significance": "<2-4 sentences: why it matters to CRE owners, lenders, tenants or investors>",
 "body": ["<2-4 plain-prose paragraphs, no markdown, only what the sources state and no longer than they support: what happened and who said what, the procedural posture, and what it means for owners, lenders or tenants, with no new facts>"],
 "tags": ["3-5 short lowercase tags"],
 "parties": [{"name": "<legal entity name exactly as the source gives it>", "role": "<Plaintiff/Defendant/Lender/Borrower/Landlord/Tenant/Debtor/Appellant/Appellee...>"}],
 "judge": "<full name if the source names the judge, else null>",
 "amountUsd": <number or null>,
 "amountBasis": "<loan | damages sought | judgment | award | settlement | claim | purchase price | other>  (omit if amountUsd is null)",
 "propertyType": "<one of: Office, Multifamily, Retail, Industrial, Hospitality, Mixed-Use, Land/Development, Medical Office, Data Center, Life Sciences, Senior Living, Self-Storage> (omit if unclear)",
 "docketUrl": "<only if verified as above, else omit>",
 "docketLabel": "<e.g. 'CourtListener docket' if docketUrl given>",
 "timeline": [{"when": "Month D, YYYY", "label": "<what happened>", "current": true}],
 "sourcesOpened": ["<every URL you actually opened and relied on>"],
 "verificationNote": "<one sentence: which source states the event date, the figures and the parties>",
 "factCheck": [{"claim": "<a figure, date, party or court in this entry>", "quote": "<the source sentence stating it, word for word>", "url": "<where>"}]
}
If you find nothing that meets the bar, return [] (an empty list is fine; padding is not).

## Editor's lessons (2026-10-13 first pass; keep adding)
- amountUsd is only an exact dollar amount a source states as at stake (loan, damages sought, judgment, award, settlement, claim). A budget, a "more than $X" deal value or a property's worth is not; put it in "amount" text instead.
- Skip suits whose real defendants or plaintiffs are individuals (e.g. RICO suits against a founder by family trusts), even if the write-up avoids names.
- Do not repeat allegations from an individual's personal bankruptcy or other personal case.
- Court opinion pages (nycourts.gov/reporter "current" lists, supremecourt.ohio.gov/rod, txcourts.gov Business Court opinions, CourtListener opinions) produced four solid rulings in one pass; work them every day.
- Court PDFs (ca9 BAP, ca6, courts.delaware.gov, pacourts.us) come back from WebFetch as unreadable binary; save the PDF and extract text (pypdf) to verify. courts.delaware.gov blocks curl, so use WebFetch's saved copy.
- The Ninth Circuit BAP opinion list (bap9.uscourts.gov/opinions) yielded two CRE bankruptcy rulings in one week; work it alongside the state lists.
- Agents fill unknown days with "1" ("January 1, 2025 (month reported; day not stated)"); write the month alone instead.
- A preferred-equity investment is not a "loan"; use amountBasis "other".
- When an appeal's only appellant is an individual (e.g. a foreclosure bidder), describe them generically and cut any finding aimed at a named individual.
- Lending beat came back empty: federal-suits.json lender suits this week were already covered or lacked explanatory reporting.
- 2026-10-14: Two agents returned the same Florida 3d DCA opinion (rulings and leases beats); expect overlap between those beats and merge, keeping the version with the trial judge.
- Agents flag filings 8 days old as "surfaced this week"; the 7-day window runs from the event date, so drop them (One Willoughby Square EB-5 suit, Cowboys Dance Hall possession suit).
- Homebuilder land banks and single-family rental purchases (e.g. Millrose/Lennar) are residential; drop them even when the defendant is a listed REIT.
- Commercial evictions captioned against a bar's owner personally (Little Red Hen, Seattle) are suits against an individual; drop them.
- Agents put developers' personal names in seoTitle/seoDescription/body; strip them and refer to the landlord entity.
- al.com and businessalabama.com block WebFetch, curl and the browser pane; corroborate their stories through WBRC (fetchable) or WebSearch snippets.
- pacourts.us Commonwealth Court opinion list produced a same-day warehouse zoning ruling; pypdf is not installed system-wide, so use a scratch venv to extract PDF text.
- Lending and bankruptcy beats both came back empty this run.
- 2026-11-11 run: the leases agent ran four days (to 11-15) and the lending agent never finished, so three good data center stories (Effingham/OpenAI Project Camellia, Sangamon/CyrusOne dismissal, Hermantown/Google AUAR) aged past 7 days and the Arbor securities suit was published by the cloud digest first (live-394). Publish each beat's verified matters as soon as that beat returns; don't wait for all six.
- Plaintiff-firm PSLRA notices state the notice date, not the filing date; the complaint PDFs are often scans. Treat the notice date as "filed on or before".
- KAXE's headline said the groups sued "Hermantown, Google," but the article body names only the city; take parties from the body, not the headline.
- The local main checkout can sit days behind origin with untracked files that collide with upstream commits; a worktree of origin/main under .task-tmp/ avoids touching another session's files.
- 2026-11-10 run: three beat agents stalled for about five days (likely on approval prompts), so the development beat's three data center matters (Nov. 4-6) were 9-11 days old by the time editing started and were dropped. Agents must finish in one sitting; an event's age is judged at publish time, not when the agent found it.
- The main checkout can be blocked from pulling by another session's untracked files; the editor worked in a git worktree under .task-tmp/ at origin/main instead of moving or deleting them.
- nycourts.gov/reporter, Justia and CourtListener returned 403 to WebFetch this run; use the browser pane for them.
- Agents tend to keep law-firm names (county counsel) and founder-named captions in the body; strip both before publishing.
- 2026-11-12 run: the lending agent took three days (the Mac slept) and the leases agent never returned; several stalled newsroom runs then woke together on 11-15. Rebuild existing.txt from a fresh origin/main right before publishing: two of this run's verified matters (Lamar Obie, McCormick County) had already been published as live-396 and live-400, and three more (Nov. 5-6 events) had aged out.
- A shared worktree under .task-tmp/ can be removed by another run mid-task; give each run its own dated worktree and keep the edited matters in the conversation, not only on disk.
- The editor has no WebFetch of its own: spot-check with the web-fetch agent, and use the browser pane for therealdeal.com, nycourts.gov and CourtListener (403 or empty to WebFetch).
- 2026-11-15 run: two of four verified matters (Prologis v. Trenton, Holmwood v. HC Government Realty) were published by a concurrent run as live-403 and live-404 minutes before this one. add_matters.py only catches a duplicate with the same sourceUrl (it added the Trenton suit again from a different outlet), so rebuild existing.txt and grep it for each party name immediately before running add_matters.py.
- Court PDFs: `curl -s -L -o .task-tmp/<name>.pdf <url>` then the Read tool on the whole file (no `pages` argument; pdftoppm is not installed) returns the full text with no pypdf or venv. Worked for courtswv.gov; courts.delaware.gov still blocks curl and triggers a download in the browser pane, so confirm caption, date and judge from its HTML opinions list (courts.delaware.gov/opinions/list.aspx?ag=court%20of%20chancery).
- Agents return briefs over the 260-character limit and HTML entities ("&amp;") inside JSON strings; check both before publishing.
- 2026-11-16 run: two of the development beat's three matters were new events in cases already tracked (the Nov. 12 ruling striking permit conditions in the St. Louis Armory data center case, live-200; the Nov. 12 Westlake/Keller settlement, live-046). The run has no step for updating an existing matter, so both were dropped as duplicates and reported to Jeff; agents should flag such follow-ups in one line instead of writing a full entry.
- A condo board's defect suit against its sponsor (394 Vanderbilt, 2d Dept.) is homeowners suing over residential units; residential, drop it even though the court list tags it as construction.
- elevenflo.com case pages (docket summaries with docket numbers) and the claims agent's Stretto site both open in WebFetch and together verified a Chapter 11 plan ruling when Law360 was paywalled. When the two disagree on a hearing date, publish the deadline both state and leave the disputed date general.
- The lending agent took over two hours and returned empty; the bankruptcy and development beats were published without waiting for it.
- A suit in a non-U.S. court (GO Residential REIT v. H&R REIT, Ontario, C$102.1M termination fee over 27 U.S. apartment properties) was held out: the tracker has no non-U.S. state code and the state counts and filters are untested with one. Needs Jeff's decision before the next one.
- West Virginia Supreme Court of Appeals opinions (courtswv.gov) produced a same-day hotel zoning-preemption ruling; add it to the rulings beat's list.
- 2026-11-15: add_matters.py refuses an entry whose docketUrl equals its sourceUrl ("record-only") and a brief over 260 characters; when the source is a CourtListener opinion page, leave docketUrl out, and count the brief before returning it.
- CourtListener opinion pages return an empty HTTP 202 to WebFetch; open them in the browser pane. Delaware Chancery PDFs are unreadable from WebFetch, but the same opinion is on CourtListener as text within hours (search the caption there).
- The rulings and big-players beats both returned the same Delaware Chancery REIT opinion, and rulings and leases the same Second Department lease case; merge and keep one.
- Re-run scripts/list_matters.py right before publishing: a second newsroom run published two of this run's lending matters (1440 Broadway, Hotel Hayden) while it was still editing.
- A ruling that is 7 days old when the agent finds it can be past the window by the time the run publishes; check event dates against the publish date.
- 2026-11-13 run (finished 11-15): five of six agents died together on a network outage ("Can't reach the API server") while the Mac was offline; when the editor wakes days later, do not relaunch the beats if newer runs have already published, just dedupe and publish what survived.
- CRE Daily briefs (credaily.com) show a sign-up wall in the browser pane but the full text to WebFetch; an agent can quote them for a Market Signal, and the editor cannot re-read them in the browser.
- Agents return "&amp;" for "&" in text fields; replace it before publishing.
- 2026-11-16 evening run (published 11-17): the brief and add_matters.py changed while the beat agents were out (verification gate, 4-paragraph limit), so their entries came back in the old format with no factCheck. Pull and re-read this brief before editing; when an entry predates the gate, the editor rewrites it from the source's exact sentences and builds factCheck itself.
- inquirer.com shows a sign-in wall in the browser pane, but `curl -s -L -A "<the verifier's user agent>" -o .task-tmp/<name>.html <url>` returns the full article, and `grep -o "[^<>{}\"]*<phrase>[^<>{}\"]*" .task-tmp/<name>.html` prints the exact sentences for factCheck; verify_matters.py reads the page too. Keep grep patterns simple: `.{0,300}` repetition fails.
- Court PDFs never match in verify_matters.py; the independent fact-checker must download the PDF (curl -o .task-tmp/..., then Read) and return every factCheck quote in confirmedQuotes, which the editor copies into secondCheck. Avoid quoting across a hyphenated line break in the PDF.
- The first fact-check of the Moore Township warehouse ruling failed because the brief said the township denied the variance when its Zoning Hearing Board did; name the body that acted, not the municipality.
- Agents add up a source's figures ("718 homes" from 172 + 381 + 165) and pull price, acreage and history from older articles; a figure no source states cannot pass the gate, so write only the numbers the source prints.
- Commit ops/matter-verification.json with js/data.js and the .sync files; add_matters.py updates it and hold_unverified.py pulls any matter missing from it.
- A leftover .git/refs/remotes/origin/main.lock (no git process running) made `git pull` fail; `git fetch origin main` still updates FETCH_HEAD, and `git rebase --autostash FETCH_HEAD` brings the checkout current without deleting anything.
- Five of six beats came back empty this run (lending, leases, big players, bankruptcy; rulings had not returned after a day). Follow-ups in tracked matters, not written up: live-164 Springfield data center moratorium (injunction denied Nov. 9), live-368 Botetourt County (dismissal denied Nov. 10), live-176 625 N. Michigan (sheriff's sale set Dec. 28).

## Market Signals duty (added 2026-10-16)
If the newest `date` in the `trends` array of js/data.js is more than 5 days old, one researcher also drafts ONE Market Signal: a market-wide CRE statistic with legal-risk relevance (CMBS/CRE CLO delinquency or special servicing, quarterly office/industrial/retail vacancy, bank CRE charge-offs, price indexes, commercial foreclosure counts), published after that newest date, not already in `trends`. Write it to ops/pending-signals/trend-NNN.json (next id) in the format of an existing file in git history (`git show 95bf9612:ops/pending-signals/trend-018.json`): a "trend" object plus a "verification" list with one verbatim quote per figure or fact, copied character for character from a page you opened with WebFetch. Never edit the trends array yourself; verify-signals.yml opens each page and publishes only if every quote matches. Do not use therealdeal.com, chainstoreage.com or bank investor-relations sites (ir.mtb.com) as the source: they block the GitHub verifier. Next id: one above the highest trend id in js/data.js and every file under ops/pending-signals/ (rejected/ and rejected/reviewed/ included).
