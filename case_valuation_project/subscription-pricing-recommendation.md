# CREdocket Subscription Pricing — Recommendation

**To:** Jeff Novel
**Re:** Adding subscription tiers on top of the existing $49/10-credit AI analysis pack
**Bottom line:** Launch three tiers — **Free ($0)**, **Practitioner ($89/mo)**, **Firm ($249/mo)** — and enforce a **hard monthly analysis cap equal to each tier's included credits**, checked in addition to (not instead of) the existing 15/day burst cap. Overage is a **hard stop**, resolved by the buyer purchasing the existing one-time $49/10-credit pack as a top-up. At current documented costs, even worst-case abuse of the top tier is a rounding error against its price — the real risk isn't a legitimate subscriber running up costs, it's the *absence* of a monthly cap letting one account ride the daily burst cap all the way to ~450 analyses/month.

---

## 1. Real per-unit cost basis

**No measured production numbers exist yet.** The `[cv-cost]` logging in `case-valuation-analyze/index.ts` (`logUsage`, lines 105–116, calls at lines 1091, 1313, 1522, with a `TOTAL` line at 1602) was only just deployed — it logs real input/output tokens and estimated cost per classify/extraction/analysis call to Supabase's function logs, but nothing has accumulated yet. Everything below is either a documented estimate from the code's own comments or a stated assumption.

**Case Value Calculator** — documented estimate, from the header comment (lines 63–69) plus the effort setting actually in effect:
- Extraction (Haiku 4.5): ~$0.02/analysis (stated directly in the comment).
- Comprehensive analysis (Opus 5): the header comment says "$0.15–0.40/analysis" total, but that comment describes the pipeline running at **xhigh effort** (line 42 of the header) — stale. The actual deployed call (line 1499) runs `effort: "medium"`, confirmed in code. At medium effort, the realistic documented estimate is **$0.10–0.25/analysis** for the Opus pass, per the benchmarking note behind this task.
- **Total realistic cost per Case Value Calculator analysis: $0.12–0.27**, plus a small classify-pass cost (a few hundred `max_tokens` on Haiku, effectively a fraction of a cent — line 1072).
- Treat **$0.40/analysis** (the stale xhigh-effort figure) as a worst-case ceiling to stress-test against, in case effort ever regresses or a request needs unusually large output.

**Lease Clause Redline Checker** — my own assumption, not measured or separately documented: same model (Opus 5), same medium effort, but `max_tokens: 8000` vs. the Case Value Calculator's `16000` (line 253 vs. 1491), a single Claude call with no extraction/classify pass and no full-document context (one clause vs. a whole filing, `MAX_CLAUSE_CHARS = 8000` vs. `MAX_DOC_CHARS = 50000`). **Assumption: roughly half to two-thirds of the Case Value Calculator's cost, i.e. $0.06–0.18/analysis.** State this to Jeff as an assumption to revisit once `[cv-cost]` logs accumulate for both tools.

**What N included analyses/month would cost the business** (using the Case Value Calculator's cost, since it's the pricier of the two tools and credits are shared — this is the correct number to plan guardrails against):

| N analyses/mo | Realistic low ($0.12) | Realistic high ($0.27) | Stress-test ceiling ($0.40) |
|---|---|---|---|
| 5 | $0.60 | $1.35 | $2.00 |
| 10 | $1.20 | $2.70 | $4.00 |
| 25 | $3.00 | $6.75 | $10.00 |
| 50 | $6.00 | $13.50 | $20.00 |
| 100 | $12.00 | $27.00 | $40.00 |

**Takeaway:** at these unit costs, API spend is not the binding constraint at any subscription price point worth charging — even 100 analyses/month tops out around $12–40. The real cost-blowout risk isn't a legitimately paying subscriber; it's an account (compromised, scripted, or just unusually determined) riding the *existing* daily cap to its ceiling with no monthly check in place at all — see Section 2.

## 2. Abuse/cost-blowout guardrails

**The concrete problem, quantified:** `DAILY_BURST_CAP = 15` (case-valuation-analyze/index.ts line 88, shared with lease-clause-redline via the same `case_valuation_analyses` table) bounds a single account to **at most ~450 analyses/month** today, with nothing else standing between that ceiling and Claude spend. At $0.27/analysis that's **$121.50/month** from one account; at the $0.40 stress-test ceiling, **$180/month**. Against an $89/month Practitioner subscription, that's not a thin margin — it's a **net loss**, and it's entirely achievable by one script hitting the endpoint 15 times a day for a month. This is exactly the scenario to close before subscriptions ship (a prepaid one-time credit pack doesn't have this exposure at all, since the credit balance itself is the ceiling — subscriptions introduce the risk by feeling "unlimited-ish" up to a monthly figure that today isn't actually enforced anywhere).

**Recommended hard monthly cap: exactly each tier's included credit allotment** (12/month for Practitioner, 40/month pooled for Firm — see Section 4). Target ratio: keep the **stress-test worst-case** monthly API cost (at $0.40/analysis, the stale/regressed-effort ceiling, not the realistic $0.12–0.27 range) at or below **~10% of that tier's monthly price**, so gross margin on API cost alone stays ≥90% even under a pessimistic per-call cost assumption, leaving headroom for Stripe fees (~3%) and everything else. Both recommended tiers clear this with room to spare (Practitioner: $4.80 stress-test cost / $89 ≈ 5.4%; Firm: $16.00 / $249 ≈ 6.4%) — so the cap is set by *the plan's included value*, not by cost pressure, which is the right way around: cost stops being the pricing driver and becomes purely a guardrail.

**Overage: hard stop, not metered billing.** Recommendation: once a subscriber hits their monthly allotment, block further analyses with a clear message and direct them to buy the **existing** one-time $49/10-credit pack as a top-up (the exact flow already built in `stripe-case-valuation-webhook/index.ts` — no new Stripe metered-billing product, no new webhook, no usage-based invoicing to reconcile). Reasoning: Jeff is a solo operator with no ops/billing team to police metered overage disputes, chargebacks, or "why was I charged $37 extra" support tickets. A hard stop is simple, predictable for the buyer, uses infrastructure that already exists and is tested, and — because purchased top-up credits are the same never-expiring one-time credits the pack already grants — doesn't require inventing a new credit "type." Metered overage is the more sophisticated answer long-term, but it's the wrong first move for a one-person shop.

**Implementation path (follow-up task, not built here):** extend the exact pattern the code already uses for the daily burst cap. Today's check (case-valuation-analyze/index.ts, "Step 3" logic mirrored in lease-clause-redline/index.ts lines 213–225) counts `case_valuation_analyses` rows for the user with `created_at >= oneDayAgo` and compares to `DAILY_BURST_CAP`. The monthly variant is the same query shape with two changes: (a) the cutoff becomes calendar-month-to-date or, better, the subscription's current billing-period start (Stripe exposes `current_period_start`; calendar-month is simpler but lets a renewal-adjacent user get two allotments close together — pick based on how much that matters), and (b) the threshold comes from a per-user `plan_type`/`monthly_credit_allotment` value instead of the fixed `DAILY_BURST_CAP` constant. This is exactly the branch the code's own comments already anticipate (case-valuation-analyze/index.ts line 12: *"a future monthly-subscription plan_type would check usage within the current billing period instead — not wired up yet"*; stripe-case-valuation-webhook/index.ts lines 15–18 says the same). Both checks (daily burst + monthly allotment) should run — the daily cap still matters as a burst-abuse governor even for a paying subscriber with plenty of monthly allotment left.

**Other abuse vectors worth flagging:**
- **Document size is already bounded, so it's not the risk.** `MAX_DOC_CHARS = 50000` (case-valuation-analyze) and `MAX_CLAUSE_CHARS = 8000` (lease-clause-redline) cap per-call token cost server-side regardless of what the client sends. The real risk is call *count*, which is what the monthly cap above addresses — not call size, which is already handled.
- **No credit rollover.** Monthly allotments should reset to the plan's fixed number each period, not accumulate — otherwise a subscriber could bank several unused months and then burn e.g. 100+ credits in one billing cycle, defeating the point of a monthly cap. (This is a plan-design decision to make when the monthly-cap logic above is built, not a separate mechanism.)
- **Credit-farming via the settlement-contribution program.** `contribute-settlement.html` grants ~3 free analysis credits per approved contribution. This is already gated by manual admin review (`admin-review-contribution/index.ts`), so it's a low-volume, human-checked vector today — worth a one-line note to keep that review manual (or add basic dedup/quality checks) if contribution volume ever grows enough that it becomes a cheaper way to farm credits than buying them.
- **Shared-account use at firms.** A single Practitioner login shared across several people at a firm would let them collectively exceed what a $89/mo single-seat plan is priced for. The Firm tier's per-seat framing addresses this for legitimate teams; for outright account-sharing there's no code-level fix recommended here, but it's worth knowing this is a plan-integrity gap, not just a technical one.
- **The existing credit-then-call ordering already helps, not hurts.** Both edge functions log (consume) a credit *before* calling Claude, deliberately, so a retry loop can't mint free re-tries from failures (see the design-note comment at the top of case-valuation-analyze/index.ts, lines 18–23). Worth knowing this protection is already in place and shouldn't be "fixed" in the name of user-friendliness.

## 3. What is this actually worth monthly? (value-based pricing)

CREdocket's buyer is a CRE-focused attorney, in-house counsel, asset manager, or a lender's workout team — not a consumer, and not primarily buying "data" the way a broker buys CoStar. Price against **one avoided bad settlement-value guess, or one hour of associate/of-counsel research time**, not against consumer SaaS or even against the API cost of running the tool.

Comparable/adjacent pricing, researched via web search:

- **Trellis** (state-court litigation analytics/judge analytics) — publicly published tiers: **$69.95/mo** (Personal), **$129.95/mo** (Research), **$199.95–209.95/mo** (Research + Judge Analytics), with an annual discount. This is the closest public comp in *shape* (litigation analytics subscription, judge-level insight) to CREdocket's tracker + judges/companies pages, and it validates the $70–210/mo band for a solo-practitioner-to-small-team litigation intelligence subscription with no AI document analysis included at all.
- **Lex Machina** — no public pricing; custom quotes reportedly run from several thousand to tens of thousands of dollars annually depending on firm size. Confirms the top of this market is priced far above CREdocket's target buyer and gives real headroom above the $70–210/mo Trellis band if CREdocket ever pursues larger firms.
- **Westlaw Edge** — single-state coverage from roughly **$107–195/mo**, all-states/federal from **~$266/mo**, all with multi-year commitments for the lower prices. This anchors what a CRE attorney already budgets monthly just for legal research access, before any litigation-specific analytics or AI tooling is added — useful context that $89–249/mo is not an unusual monthly legal-tool line item for this buyer.
- **CoStar** — $300–1,200/mo (roughly $3,000–23,000/year, averaging ~$15,000/year), and **Reonomy** — $400–500/mo per seat. Both are the CRE-data end of the comp set, priced well above CREdocket; useful mainly to confirm CRE professionals already pay hundreds per month for data platforms, which supports CREdocket pricing well above a typical newsletter/content subscription.
- **Crexi Insights** — pricing is quote-only/opaque, not usable as a hard anchor.
- **AI contract-review tools** (the closest comp to the Case Value Calculator / Lease Clause Redline specifically) — **Spellbook**: $99/user/month standard tier, $350/user/month enterprise. **Ironclad**: enterprise deals reportedly $30,000–$250,000+/year (not a relevant comp for a solo/small-team buyer). Spellbook's $99/user/month for AI-assisted legal drafting/review is the most directly relevant anchor for what a practicing attorney already pays, per seat, for an AI legal tool — and it's priced with *no separate per-document metering* the way CREdocket's credit system does, which supports CREdocket's own AI credits being perceived as generous rather than stingy at the volumes proposed below.

**Reading across these:** $70–210/mo is a well-established band for litigation-analytics-only subscriptions with no AI document analysis (Trellis); $99+/user/month is established for AI-assisted legal document review alone (Spellbook); CRE data platforms clear $300+/mo routinely. CREdocket combining litigation tracking + judge/company analytics + AI case valuation + AI lease clause redlining in one subscription justifies pricing at or above the analytics-only comps, without needing to approach CoStar/Reonomy CRE-data pricing (CREdocket isn't selling property/ownership data).

## 4. Concrete recommended tiers

| | **Free** | **Practitioner** | **Firm** |
|---|---|---|---|
| Price | $0/mo | **$89/mo** | **$249/mo** |
| Tracker, judges/companies, calendar, quarterly report, settlement benchmarks, lien-deadline calculator, ADA tools, both free handbooks | Full access (already free today, no change) | Full access | Full access |
| Full case write-ups (Case Timeline + Full Article) | 3 distinct matters/month | Unlimited | Unlimited |
| Watchlists & alerts | Included (as today) | Included | Included, pooled across the firm's seats |
| AI analysis credits/month (Case Value Calculator + Lease Clause Redline, combined pool, same as today's shared pool) | None included — pay-as-you-go only | **12/month** | **40/month, pooled across up to 3 seats** |
| Monthly hard cap | N/A | 12 | 40 |
| Overage | N/A | Buy the existing $49/10-credit pack (stacks as never-expiring credits) | Same |
| One-time $49/10-credit pack | Available, no subscription required | Available as a top-up beyond the monthly allotment | Available as a top-up |
| Seats | 1 | 1 | Up to 3 |

**Reasoning, decisively:**

- **Free stays exactly what's free today** (per the code inventory below) — nothing currently free gets pulled behind a paywall by this recommendation. The one change on the free tier is **re-enabling `ENFORCE_MONTHLY_LIMIT`** (js/auth.js, line 312 — currently `false`, with a comment noting it was turned off "temporarily... while we're still getting the account flow dialed in"; js/main.js:337 only *reads* this flag via `window.RELAW_AUTH.ENFORCE_MONTHLY_LIMIT`, it isn't defined there). Flipping that constant to `true` is the one piece of already-written code this recommendation depends on activating — there's no reason to keep giving away unlimited full write-ups for free once a paid alternative exists to upgrade to; today there's no upgrade path so leaving it off made sense, but launching Practitioner removes that justification.
- **Practitioner at $89/mo** targets the solo CRE litigator or in-house counsel who currently either browses free content only or occasionally buys a $49 pack. $89/12 credits ≈ $7.42 per included credit — a real premium over the $4.90/credit pack rate, which is intentional: it keeps the one-time pack the *rational* choice for a genuinely occasional user (a couple of analyses a year) while making the subscription rational specifically for someone who also wants unlimited full write-up reads and predictable monthly billing instead of restocking a pack every few months. Priced below Trellis's mid/top tiers ($130–210/mo) despite bundling AI analysis on top of tracking/analytics that Trellis doesn't offer at all.
- **Firm at $249/mo** targets a small firm's real-estate litigation group or a lender's workout team — the buyer explicitly named in Section 3, where one avoided bad settlement-value read easily clears a few hundred dollars a month. Priced just above Trellis's top single-analyst tier ($209.95/mo) but for up to 3 seats and more than 3x the credits, and still an order of magnitude below CoStar/Reonomy/Lex Machina's small-firm entry points.
- **The one-time $49/10-credit pack is not retired.** It remains the zero-commitment option for anyone who wants to try the AI tools without a subscription, and it becomes the built-in overage mechanism for subscribers who exceed their monthly allotment (Section 2). This is the cleanest way to relate the two pricing models: subscriptions are for regular users who also want unlimited content access; the pack is for everyone else, at every usage level, including subscribers who need a one-off boost.

## 5. Annual/margin sanity check — top tier (Firm, $249/mo)

**Worst-case usage a real subscriber could actually trigger:** the full 40-credit monthly allotment, entirely on the pricier tool (Case Value Calculator), at the stress-test cost ceiling ($0.40/analysis — the stale xhigh-effort figure, used here deliberately as a pessimistic bound rather than the realistic $0.12–0.27 estimate):

- Worst-case monthly API cost: 40 × $0.40 = **$16.00**
- Against $249/mo revenue: **6.4% of revenue**, gross margin **≈93.6%** on API cost alone.

Using the realistic documented range instead (40 × $0.12–0.27 = **$4.80–$10.80**), the gross margin is **≈95.7–98.1%**.

**Confirmed healthy in both cases.** Even the pessimistic stress-test bound — which assumes the model regresses to the higher xhigh-effort cost profile the code has already moved away from, *and* that every single credit gets spent on the more expensive of the two tools — leaves gross margin above 93% before Stripe fees (~3%) and any other overhead. Cost is not, and should not be, the pricing constraint here; the guardrails in Section 2 exist to keep it that way against abuse, not against ordinary heavy legitimate use.

---

### Source inventory used for this memo (for Jeff's reference)

- Cost basis: `/Users/jeffnovel/RELAW/supabase/functions/case-valuation-analyze/index.ts` (header comment lines 1–116; effort/model settings lines 1491–1499; `logUsage` lines 105–116); `/Users/jeffnovel/RELAW/supabase/functions/lease-clause-redline/index.ts` (header comment lines 1–38; call config lines 250–266).
- Credit pool / pricing today: `/Users/jeffnovel/RELAW/js/case-valuation.js` (line 40, `PRICE_DISPLAY`), `/Users/jeffnovel/RELAW/js/lease-clause-redline.js` (line 19), `/Users/jeffnovel/RELAW/supabase/functions/stripe-case-valuation-webhook/index.ts` (`ONE_TIME_CREDITS = 10`, line 66, and the plan_type note at lines 15–18).
- Free-content paywall: `/Users/jeffnovel/RELAW/js/auth.js` (`MONTHLY_LIMIT = 3`, `ENFORCE_MONTHLY_LIMIT = false`, lines 306–312) and `/Users/jeffnovel/RELAW/js/main.js` (gate UI, lines ~306–350).
- Free-vs-gated inventory confirmed directly from the repo root HTML: `litigation.html`, `judges.html`, `companies.html`, `calendar.html`, `quarterly.html`, `settlement-benchmarks.html`, `lien-deadline-calculator.html`, `ada-risk-flagging.html` are all fully free/ungated today (no sign-in gate found in any of them); `eviction-guide.html` and `premises-liability-guide.html` are free-with-sign-in (no purchase — the eviction guide's Stripe-style terms gate was explicitly disabled per its own in-file comment, "Terms gate temporarily disabled -- this page is now free"); `case-valuation.html` and `lease-clause-redline.html` run on the shared paid-credit pool; `account.html` is the watchlist/auth surface.
- Contribution-credit program: `contribute-settlement.html` (~3 credits per approved contribution) and `supabase/functions/admin-review-contribution/index.ts` (manual review gate).
