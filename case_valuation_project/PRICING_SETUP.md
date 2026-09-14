# Shipping the Practitioner/Firm subscription tiers — setup checklist

Everything on the code side is built and deployed-ready. This is the remaining
manual setup — all of it is one-time, in Stripe and Supabase dashboards, and
none of it requires writing code.

## 1. Run the database migration

Supabase SQL Editor → paste and run `case_valuation_project/schema_subscriptions.sql`
in full. Safe to re-run if needed.

## 2. Create the two recurring Prices in Stripe

Stripe Dashboard → Product catalog → **+ Add product**, twice:

- **Product:** "CREdocket Practitioner" — **Price:** $89.00, recurring monthly
- **Product:** "CREdocket Firm" — **Price:** $249.00, recurring monthly

For each, copy the **Price ID** (starts with `price_...`, NOT the Product ID
which starts with `prod_...`) — you'll need both in step 5.

## 3. Create a Payment Link for each Price

Stripe Dashboard → Payment links → **+ New**, once per plan, each pointing at
the Price you just created (this automatically makes it a subscription
checkout, no extra configuration needed — same pattern already used for the
existing one-time $49/10-credit pack). Copy each resulting Payment Link URL
(`https://buy.stripe.com/...`).

## 4. Add the new secrets to Supabase

Supabase Dashboard → Edge Functions → Secrets (project-wide) → add:

- `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys → **Secret
  key** (starts with `sk_live_` or `sk_test_`). Not previously needed by any
  function; now required so the webhook can look up a new subscription's
  billing period/price at checkout time.

(`STRIPE_CASE_VALUATION_WEBHOOK_SECRET` already exists from the original
one-time-pack setup — nothing to do there.)

## 5. Register 2 more webhook events on the EXISTING endpoint

Stripe Dashboard → Developers → Webhooks → the existing
`stripe-case-valuation-webhook` endpoint → **+ Select events** → add:

- `customer.subscription.updated`
- `customer.subscription.deleted`

(`checkout.session.completed` is already registered from the one-time-pack
setup — leave it as-is, the webhook code now branches on `session.mode` to
tell a one-time purchase from a subscription checkout.)

## 6. Fill in the real Price IDs and redeploy the webhook

Open `supabase/functions/stripe-case-valuation-webhook/index.ts`, find
`PRICE_ID_TO_PLAN` near the top, and replace the two placeholder strings with
the real Price IDs from step 2:

```ts
const PRICE_ID_TO_PLAN: Record<string, { planType: string; monthlyCreditAllotment: number }> = {
  "price_...your real Practitioner price ID...": { planType: "practitioner", monthlyCreditAllotment: 12 },
  "price_...your real Firm price ID...": { planType: "firm", monthlyCreditAllotment: 40 },
};
```

Then: Supabase Dashboard → Edge Functions → `stripe-case-valuation-webhook` →
Code tab → select all, delete, paste the updated file, deploy.

## 7. Fill in the real Payment Link URLs on the pricing page

Open `js/pricing.js`, replace the two placeholder URLs with the real Payment
Links from step 3, then push to git (this is a static file, no redeploy step
— live the moment it's pushed).

## 8. Redeploy the two analysis functions

Both `case-valuation-analyze` and `lease-clause-redline` now check the new
subscriptions table before falling back to one-time credits. Supabase
Dashboard → Edge Functions → each function → Code tab → select all, delete,
paste the current file, deploy.

## 9. Test end to end before announcing anything

1. Subscribe to Practitioner yourself (test mode if you have it enabled, or a
   real low-stakes charge you'll refund) using an email that matches a real
   CREdocket account.
2. Check `account.html` shows "Practitioner" and the credit count.
3. Run a Case Value Calculator analysis — confirm it doesn't touch a one-time
   credit balance, and `case_valuation_analyses` logs `credit_source =
   'subscription'` for it (Supabase Table Editor).
4. Cancel the test subscription in Stripe's customer portal and confirm
   `case_valuation_subscriptions.status` flips to `canceled` and
   `account.html` reverts to showing "Free".

---

Nothing about the existing $49/10-credit one-time pack changes in any of the
above — it keeps working exactly as it does today, subscription or not.
