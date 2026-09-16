# CREdocket (credocket.com) — project rules

Static HTML/CSS/JS site (no build step), auto-deployed by Vercel on every push to `main`. Backend is Supabase (project ref `ribmcdyoydhmafnyfhpp`). This file applies to every session working in this repo, human-driven or unattended cloud automation alike.

## Hard boundaries — never do these, no exceptions

- **Never `git add` anything under `case_valuation_project/data/`** (`claim_citations*.json`, `research/`) — this is the proprietary case-citation database behind the paid Case Value Calculator. It leaked into the public repo once already (fixed, but the git-history purge decision is still pending Jeff's explicit go-ahead — don't attempt a `git filter-repo`/history rewrite yourself). `.gitignore` already covers these paths; if a staged diff ever includes one, stop and remove it before committing.
- **Never flip `FREE_MODE` to `false`** in `js/case-valuation.js`, `js/lease-clause-redline.js`, `supabase/functions/case-valuation-analyze/index.ts`, or `supabase/functions/lease-clause-redline/index.ts`. This is the switch that turns on real Stripe billing for paying subscribers — a business decision only Jeff makes.
- **Never touch pricing, Stripe keys, or webhook configuration.** Never attempt "Stage 9" subscription testing (case_valuation_project/PRICING_SETUP.md) — that requires either a real charge or Stripe test-mode credentials only Jeff can provide.
- **Never do a destructive git operation**: no `git push --force`, no `git filter-repo`, no rewriting history, no deleting branches. Fast-forward pushes to `main` only.
- **Never fabricate content.** Every case citation, docket link, market-data figure, or factual claim must be found via real research (WebSearch/WebFetch) and verified against an actual source before publishing. If you can't verify something to at least medium confidence, leave it out — report less rather than pad with invented detail. This applies to case names, dollar amounts, holdings, docket numbers, and market statistics alike.
- **Never construct a generic "search for this on [portal]" link and label it a docket.** A `docketUrl` is only ever added when you've found and confirmed one specific, case-matching result (see "Docket links" below).
- **Never create logins/accounts or bypass CAPTCHAs** to access a research source (e.g., re:SearchTX now requires an eFileTexas login — don't create one; Cook County and Dallas County court portals gate behind reCAPTCHA — don't solve it). If a source needs credentials or a CAPTCHA, skip it.
- **Never spend money or take any action with a real financial consequence.**

## Validation discipline — every change, every time

1. `git fetch origin && git log HEAD..origin/main --oneline` before every commit — never push on top of unseen upstream changes.
2. `git status --short` after staging — confirm exactly the intended files are staged, nothing under `case_valuation_project/data/` snuck in.
3. HTML tag-balance check on every touched `.html` file (a small Python `HTMLParser`-based validator — track open/close tags, void elements `area base br col embed hr img input link meta param source track wbr`, fail on mismatch or anything left open at EOF).
4. `deno check --no-config <file>` on every touched `.ts`/`.js` file.
5. After pushing, verify live: `curl` or the Browser tool against `https://credocket.com/...`, confirm the change actually landed and `read_console_messages` shows no new errors. Never consider a change "done" without this — CDN cache and Vercel bot-challenge can both make `curl` look wrong when the Browser tool would show it's actually fine, and vice versa.
6. One logical change per commit, with a clear message explaining what and why (not just what).

## Content taxonomy

- **Tracker categories** (`RELAW_DATA.categories` in `js/data.js`, 9 total): landlord-tenant, zoning-land-use, reit-securities, construction-defect, lending-foreclosure, environmental, eminent-domain, lease-disputes, premises-liability.
- **Case Value Calculator categories** (7, NOT 9 — deliberately narrower than the tracker, no premises-liability or a couple others modeled): see `case-valuation-methodology.html` for the current authoritative list. A stale "8 categories" or mismatched count has been a recurring real bug — if you see a hardcoded category count anywhere, check it against the live array length rather than trusting the copy.
- **`propertyType` controlled vocabulary**: Office, Multifamily, Retail, Industrial, Hospitality, Mixed-Use, Land/Development, Medical Office, Data Center, Life Sciences, Senior Living, Self-Storage.

## Docket links (`docketUrl`/`docketLabel` on case objects)

Added going forward only, never backfilled in bulk. Only add when you have a confirmed, case-matching result from one of these vetted-free sources:
- **CourtListener** (federal courts only — RECAP has zero state-court coverage) — a docket permalink or, absent a RECAP docket, a published opinion.
- **NYSCEF** — confirmed via a real secondary source stating the exact index number (the portal itself has no stable deep-link to a specific case).
- **TAMES** (search.txcourts.gov) — Texas appellate/Supreme Court only, free, no login. NOT re:SearchTX (that now requires an eFileTexas account — don't use it).
- **Cook County, IL Clerk of Circuit Court** case lookup — gated behind reCAPTCHA as of 2026-09; don't attempt.

Delaware Chancery Court has no free public docket at all — don't spend research time there. Most CA/FL/IL trial courts outside Cook County have no unified free portal.

## Established patterns to reuse, not reinvent

- **New vertical page** (`<property-type>.html`): copy an existing one (e.g. `self-storage.html`) as the template — nav, footer, `related-grid` JS block, data-load retry guard. 6 cards of real, sourced, medium+ confidence content. Link it from `property-types.html`'s grid and add to `sitemap.xml`.
- **New judge/company profile page**: `judge-<slug>.html` / `company-<slug>.html`, driven entirely by `RELAW_DATA.judges` / `RELAW_DATA.trackedParties` in `js/data.js` — if an entry exists in the data but its page is missing, judges.html/companies.html's own "Full profile" link is already silently broken; generate the page from an existing one as a template rather than by hand.
- **Sitemap**: regenerate from every real `.html` file in the repo root (excluding pages with `<meta name="robots" content="noindex">` and `account.html`), with `lastmod` from each file's own `git log -1` date — don't hand-edit individual entries.
- **Digest automation**: the ongoing case-tracker research pipeline's full instructions live in `scripts/re-legal-news-digest-prompt.md` — read it before extending `js/data.js`'s `cases` array, since it documents the exact object schema, field-by-field.

## Where things run

- Site: Vercel, auto-deploy on push to `main`.
- Two cloud `RemoteTrigger` routines already exist: a twice-daily tracker digest (new cases) and a daily citation-research routine (calculator data, writes only a public names/years index — the actual research goes into the routine's own run log for a human/future session to harvest).
- Supabase Edge Functions are deployable from a local session via the `supabase` CLI (`/Users/jeffnovel/.claude/tools/supabase functions deploy <name> --project-ref ribmcdyoydhmafnyfhpp --use-api`), but this is local-machine tooling, not available to a cloud routine — a cloud session can commit/push code changes to functions but cannot redeploy them itself.

## Cloud routine environment network restriction (found 2026-09-16)

The shared cloud environment these `RemoteTrigger` routines run in (`env_012vtaXd2epXua1af1ABzawg`) has a network egress proxy that blocks `WebFetch` and raw `curl`/`Bash` HTTPS requests to essentially every external domain — including credocket.com itself, CourtListener, and generic sites like Wikipedia. **`WebSearch` still works** (it's Anthropic-hosted, not routed through this proxy). This means, in this environment:
- Any task requiring a direct API call (e.g. CourtListener's REST API for docket verification) or a WebFetch-confirmed source cannot be completed to the site's normal standard — don't attempt it; fall back to a fully-local task instead (numeric-claim audits, dead-link checks, etc.) or accept and clearly disclose WebSearch-snippet-only sourcing at a correspondingly lower confidence bar.
- A push to `main` cannot be followed by the usual live `curl`/WebFetch verification against credocket.com from inside this environment — verifying the push actually landed against `git log`/`git fetch` against origin is the best available substitute here; genuine live-site verification has to wait for a session that isn't behind this proxy (a local session, or Jeff himself).
- This has been true for the existing twice-daily digest routine the whole time too — it happens to never need WebFetch/curl (WebSearch + a GitHub Action relay for the one Supabase write it needs), which is why this was never surfaced before. Any new routine design for this environment should follow the same WebSearch-only, no-direct-fetch pattern.
