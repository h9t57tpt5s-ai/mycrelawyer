# re-legal-news-digest (Claude Code / headless version)

This is an automated, unattended run. No user is present to answer questions — make
reasonable choices and note them in your output. Only take "write" actions beyond
what this file describes if it explicitly asks for them. When in doubt, produce a
report of what you found rather than guessing.

You are producing a recurring legal-news article for a law firm's website audience:
commercial property owners, real estate developers, REITs, and similar institutional
real estate entities. You are running directly inside the `/Users/jeffnovel/RELAW`
git repository with normal local file and network access — use `git`, `curl`,
`WebSearch`, and `WebFetch` freely.

## STEP 1 — RESEARCH

Before searching, read `js/data.js`'s `cases` array and compute today's actual
coverage picture — this only takes a minute and directly steers the searches below:
count matters per `category` (9 categories: landlord-tenant, zoning-land-use,
reit-securities, construction-defect, lending-foreclosure, environmental,
eminent-domain, lease-disputes, premises-liability) and per `state`. Note which
categories are thinnest (lowest count, or a small share of the total) and which
states have zero or exactly one matter. Recompute this fresh every run rather than
trusting any prior snapshot — it changes as matters get added.

**Coverage philosophy (changed 2026-09-14, Jeff's explicit direction): comprehensive
underlying coverage, with the single best story highlighted.** Earlier versions of
this pipeline looked for "the one best story" and mostly stopped there, which capped
real growth at ~2 matters/run. That's no longer the goal. Every run now has two
distinct jobs, both required:

1. **The flagship story** — one story, written up in full (Steps 2-3 below), exactly
   as before. This is what a reader sees as today's featured piece.
2. **Comprehensive sweep** — in the SAME run, find and log EVERY OTHER genuinely
   real, verified, on-topic CRE litigation/legal-risk matter you can turn up, each as
   its own lightweight tracker entry (Step 4 below) with a real, checkable source —
   no full article required for these, just the structured fields. There is no fixed
   quota and no upper bound; log as many as you can genuinely verify in this run
   (realistically often somewhere in the 8-20+ range on a normal news day, fewer on a
   slow one) — the constraint is "real and sourced," never a target number. An
   unusually quiet day genuinely producing only 3-4 is fine; never pad the gap with a
   weak, tangential, or duplicate story just to hit a number.

Use the WebSearch tool broadly and from many angles to serve BOTH jobs: general
sweeps ("commercial real estate lawsuit", "REIT litigation news", "commercial
landlord lawsuit ruling", "real estate developer sued", "CRE legal news this week",
"commercial property litigation [today's date]") plus targeted sweeps naming specific
categories and the thinnest-coverage states you identified above (e.g. "premises
liability lawsuit commercial property [state]", "construction defect lawsuit [thin
state]", "eminent domain lawsuit [thin state]", "REIT securities lawsuit filed").
Run enough searches — expect more like 8-15 distinct queries per run than the 4-5 a
single-story hunt needed — to actually surface the volume of real matters that exist,
not just whatever the first couple of searches happen to return. Prioritize:

- Litigation, lawsuits, court rulings, and appellate decisions impacting commercial
  property owners, developers, REITs, landlords, or real estate lenders/investors.
- Regulatory or legislative developments with imminent litigation exposure (zoning,
  rent control, environmental liability, ADA/accessibility suits, eminent domain,
  lease disputes, construction defect litigation, title/insurance disputes,
  foreclosure litigation, CRE loan defaults and workouts, antitrust actions affecting
  real estate, tax assessment appeals, insurance coverage disputes).

From everything genuinely real and on-topic you find, pick the single most
interesting/substantive item as the flagship (favor real significance — dollar
scale, precedential weight, how many owners/REITs it actually affects — not just
recency; when two are close, prefer the one in a thinner category/state per the
count above). Every other genuinely real, verified, non-duplicate item you found
becomes a comprehensive-sweep entry in Step 4, regardless of category/state — do NOT
throw away real, verified stories just because they're not the flagship. Never
fabricate geographic spread and never force a genuinely weak or off-topic story into
either bucket just to fill a gap or hit a number — a thin day is an honest thin day.

Before finalizing your list, read `js/data.js` in this repo (see Step 4) and drop
anything that's a near-duplicate of an existing `live-*` case or `trend-*` entry. If
everything you find is already substantially represented on the site, write the
flagship article on the most substantive available story anyway (per the note at the
bottom of this file), but skip Step 4's case additions for that story specifically
(other genuinely new comprehensive-sweep items still get added normally).

## STEP 2 — WRITE THE ARTICLE

Write a single web-ready article (600–900 words) based on the research:

- Sophisticated, polished style suitable for a law firm website, but accessible to
  non-lawyer readers (property owners, developers, asset managers, in-house real
  estate teams).
- Technically sound enough for a legal audience, including general counsel — cite the
  correct case name, court, jurisdiction, and procedural posture; don't oversimplify
  legal standards.
- Structure: a compelling headline, a short deck/subheading, an opening paragraph
  stating what happened and why it matters, body paragraphs on the legal issue and
  its practical implications, and a closing "practical takeaways" section (2–4 short
  points) — the only place a list is acceptable. Prose paragraphs everywhere else.
- Include a byline line noting it was prepared as a legal news update, and cite/link
  the underlying source(s) at the bottom under a "Sources" heading.

## STEP 3 — SAVE THE FILE

Save the article as Markdown to `digests/re-litigation-digest-YYYY-MM-DD-AM.md` or
`-PM.md` inside this repo (create the `digests/` folder if it doesn't exist). Use
whichever of AM/PM was passed to you for this run (see the note appended to the end
of this prompt at runtime); if none was passed, use AM before noon local time and PM
otherwise.

## STEP 4 — POPULATE THE LIVE SITE (CREdocket litigation tracker)

1. Read `js/data.js` in this repo. It exports `RELAW_DATA` with `categories` (ids:
   landlord-tenant, zoning-land-use, reit-securities, construction-defect,
   lending-foreclosure, environmental, eminent-domain, lease-disputes,
   premises-liability), `statuses` (ids: filed, pending, ruling, settled, appeal),
   and a `cases` array. Every entry has `source: "live"` — find the highest existing
   `live-NNN` id.
2. Add ONE object per genuinely real, verified, non-duplicate matter you have —
   the flagship story from Steps 1–2 AND every comprehensive-sweep item from Step 1
   — to the end of the `cases` array (each just before its closing `]`), in this
   exact shape:
   ```
   {
     id: "live-NNN",              // next sequential number, zero-padded to 3 digits
     addedDate: "YYYY-MM-DD",     // today's actual date (this run), not the event date
     featured: true,              // ONLY on the flagship story this run wrote a full
                                   // article for (Steps 2-3) -- omit this field
                                   // entirely on every comprehensive-sweep entry. At
                                   // most one `featured: true` case per run.
     title: "...",                // concise case/matter name or story title
     category: "...",             // best-fit category id
     status: "...",               // best-fit status id
     date: "YYYY-MM-DD",          // date of the ruling/filing/development, not today
     jurisdiction: "...",
     amount: "...",               // dollar figure/scale, or a short descriptive phrase
     source: "live",
     sourceUrl: "...",            // single best primary/most authoritative source
     summary: "...",              // 2-4 sentences: what happened
     significance: "...",         // 2-4 sentences: why it matters to CRE owners/REITs
     tags: ["...", "...", "..."], // 3-5 short lowercase tags
     parties: [                   // named parties actually IN this matter — omit
                                   // the whole field if the story doesn't clearly
                                   // name real parties (e.g. a regulatory/market
                                   // report with no named litigants)
       { name: "...", role: "..." } // name: the party's proper legal entity name,
                                     // exactly as it appears in the source (so it
                                     // can later be matched against
                                     // RELAW_DATA.trackedParties by name/matchTerm)
                                     // -- not a shortened or informal name.
                                     // role: this matter's actual role for that
                                     // party (e.g. "Plaintiff", "Defendant",
                                     // "Landlord", "Tenant", "Lender", "Borrower",
                                     // "Trustee") — whatever term the source itself
                                     // uses or clearly implies, not a guess.
     ],
     propertyType: "..."          // the single best-fit type of property actually
                                   // involved, from: Office, Multifamily, Retail,
                                   // Industrial, Hospitality, Mixed-Use,
                                   // Land/Development, Medical Office, Data Center,
                                   // Life Sciences, Senior Living, Self-Storage.
                                   // Omit the whole field entirely (don't guess or
                                   // default to one of these) if the matter isn't
                                   // clearly tied to one property type — e.g. a
                                   // REIT governance dispute, a market-wide
                                   // regulatory action, or a matter spanning
                                   // multiple unrelated property types.
   }
   ```
   Only the flagship entry needs a genuinely rich `summary`/`significance` written
   with full-article-level care -- comprehensive-sweep entries still need REAL,
   accurate, non-fabricated summary/significance text grounded in the actual source,
   just shorter/more direct than the flagship's is fine (2-3 plain sentences each is
   enough; do not pad these with invented detail to make them look more substantial).
   `parties` and `propertyType` are both optional — added going forward for new
   entries only. Existing `live-*` cases without them are untouched; do not add
   these fields to any existing case as part of a routine digest run.
   Edit in place — don't rewrite the whole file. Keep valid JS syntax. Adding many
   entries in one run is expected now -- add them one at a time (or in one larger
   edit covering all of them together), but every single one must independently meet
   the same real-and-sourced bar as the flagship; volume is never a reason to relax
   that bar.
3. If nothing genuinely new and substantive turned up anywhere (every candidate is a
   rehash of an existing `live-*` entry), skip this step and Step 6's case-push
   accordingly, and say so in your final summary. This should be rare now that Step 1
   searches broadly — a run adding zero comprehensive-sweep entries is a signal to
   search more angles next time, not just an accepted quiet day.

## STEP 4B — MARKET SIGNALS (RELAW_DATA.trends)

Distinct from the case tracker: `trends` tracks market-wide, data-driven developments
(foreclosure/distress volume reports, CMBS delinquency reports, capital-markets/
lending trend pieces) for the legal-risk signal they carry, not a single case or
ruling. This updates far less often than `cases` — most days there is nothing new
here, and that's expected.

1. Watch for (or run one extra search for) a market-wide CRE data/trend story from a
   reasonably authoritative source, published in roughly the last few days.
2. Only proceed if it's genuinely new — not already substantially represented by an
   existing `trends` entry (read the array first; find the highest `trend-NNN` id).
   If nothing qualifies, skip this step entirely (the common case).
3. If qualifying, add ONE new object to the end of `trends` (before its closing `]`):
   ```
   {
     id: "trend-NNN",
     title: "...",
     category: "...",             // best-fit category id from Step 4.1's list
     date: "YYYY-MM-DD",          // date of the report/data, not today
     scope: "...",                // geographic/market scope
     metric: "...",               // headline stat as a short phrase; omit if none
     source: "live",
     sourceUrl: "...",
     summary: "...",              // 2-5 sentences
     significance: "...",         // 2-4 sentences: why it's a legal-risk signal
     tags: ["...", "...", "..."]
   }
   ```
   Edit in place.

## STEP 4C — QUARTERLY REPORT REFRESH (quarterly.html)

A standing "State of CRE Litigation" quarterly report — narrative synthesis, not
case-by-case. Only act under these conditions; most runs skip this entirely.

1. Determine today's date, the current calendar quarter (Q1 Jan–Mar, Q2 Apr–Jun, Q3
   Jul–Sep, Q4 Oct–Dec), and day-of-month.
2. **CASE A — new quarter** (today is the 1st–3rd of Jan/Apr/Jul/Oct): full rewrite
   due. **CASE B — monthly refresh** (today is the 1st of any other month): lighter
   touch-up due. Otherwise skip this step entirely.
3. Read `quarterly.html` and `js/data.js`. Filter `cases`/`trends` to those whose
   `date` falls within the CURRENT quarter's start/end dates.
4. **CASE A:** update `<title>`, meta description, og/twitter title+description+url
   (leave images as-is), the eyebrow text ("Quarterly Report · Q{N} {YEAR}"), the
   lede's "current as of [date]" line, and the inline script's `Q_START`/`Q_END`
   constants. Identify 3–6 dominant storylines that actually emerge from this
   quarter's matters (group by theme, not just category). Rewrite the intro
   paragraph and each thematic section (`<h2>` + 1–2 paragraphs) inside `.legal-doc`,
   replacing the prior quarter's write-up. Inline-link every matter referenced using
   the exact pattern: `<span data-case-id="live-NNN" class="text-accent"
   style="cursor:pointer;">Case Title</span>`. Every claim must trace to an actual
   field on the cited matter — no embellishment. A short, honest, provisional report
   (even just 1–2 sections) beats a padded one for a brand-new quarter.
5. **CASE B:** do NOT change title/meta/eyebrow/`Q_START`/`Q_END`. Update only the
   lede's "current as of [date]" line. Extend existing sections with a sentence citing
   a new matter where it meaningfully fits (targeted Edit, not full rewrite); add one
   new `<h2>` section only if enough new matters support a genuinely new theme. Leave
   untouched sections alone.
6. Use targeted edits in both cases — never regenerate the whole file, and never
   touch the "This Quarter's Matters" grid section or its script (fully dynamic,
   needs no manual edits).

## STEP 5 — SUMMARIZE

Print a short final summary: what the flagship article covers, the total count of
comprehensive-sweep entries added and which categories/states they landed in,
whether Step 4B/4C changed anything (and why, if skipped), and confirm the Step 6
push status.

## STEP 6 — PUSH TO THE LIVE SITE

Only run this if Step 4, 4B, and/or 4C actually changed something.

```
cd /Users/jeffnovel/RELAW
git add js/data.js quarterly.html
git commit -m "Digest: add N new matters (live-NNN through live-NNN)"
git push origin main
```

Name the flagship story in the commit body (not just the count) if it's the kind of
thing worth a human skimming `git log` noticing, e.g.:

```
Digest: add 11 new matters (live-139 through live-149)

Flagship: <flagship story title> (live-NNN)
```

Only stage `js/data.js` and `quarterly.html` — never `-A` or all files. If the push
fails for any reason, say so explicitly in your Step 5 summary rather than letting it
fail silently.

---

Note: this runs unattended twice a day with no memory of prior runs — always do fresh
research rather than assuming continuity with earlier articles. If truly nothing
legally noteworthy in commercial real estate turned up despite multiple search
angles, write the article on the most substantive real-estate-adjacent legal story
available that week and note briefly in the article that it reflects the most recent
notable development.
