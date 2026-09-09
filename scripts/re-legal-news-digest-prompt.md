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

Use the WebSearch tool to find the most interesting, recent real estate industry news
from a LEGAL perspective, published in roughly the last 12–24 hours (a bit older is
fine if nothing fresh is out — use judgment). Prioritize:

- Litigation, lawsuits, court rulings, and appellate decisions impacting commercial
  property owners, developers, REITs, landlords, or real estate lenders/investors.
- Regulatory or legislative developments with imminent litigation exposure (zoning,
  rent control, environmental liability, ADA/accessibility suits, eminent domain,
  lease disputes, construction defect litigation, title/insurance disputes,
  foreclosure litigation, CRE loan defaults and workouts, antitrust actions affecting
  real estate, tax assessment appeals, insurance coverage disputes).

Run several searches from different angles ("commercial real estate lawsuit", "REIT
litigation news", "commercial landlord lawsuit ruling", "real estate developer sued",
"CRE legal news this week") to find the single most interesting, substantive story or
a tight cluster of 2–3 related stories. Evaluate for genuine relevance and impact —
don't just grab the first result.

Before settling on a story, read `js/data.js` in this repo (see Step 4) and check it
isn't a near-duplicate of an existing `live-*` case or `trend-*` entry. If everything
you find is already substantially represented on the site, write the article on the
most substantive available story anyway (per the note at the bottom of this file),
but skip Steps 4/4B's case/trend additions for that story.

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
   lending-foreclosure, environmental, eminent-domain, lease-disputes), `statuses`
   (ids: filed, pending, ruling, settled, appeal), and a `cases` array. Every entry
   has `source: "live"` — find the highest existing `live-NNN` id.
2. For the story from Steps 1–2, add ONE new object to the end of the `cases` array
   (just before its closing `]`) with this exact shape:
   ```
   {
     id: "live-NNN",              // next sequential number, zero-padded to 3 digits
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
     tags: ["...", "...", "..."]  // 3-5 short lowercase tags
   }
   ```
   Edit in place — don't rewrite the whole file. Keep valid JS syntax.
3. If nothing genuinely new and substantive turned up (a rehash of an existing
   `live-*` entry), skip this step and Step 6's case-push accordingly, and say so in
   your final summary.

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

Print a short final summary: what the article covers, whether Step 4/4B/4C changed
anything (and why, if skipped), and confirm the Step 6 push status.

## STEP 6 — PUSH TO THE LIVE SITE

Only run this if Step 4, 4B, and/or 4C actually changed something.

```
cd /Users/jeffnovel/RELAW
git add js/data.js quarterly.html
git commit -m "Digest: add <case/trend title> (live-NNN / trend-NNN)"
git push origin main
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
