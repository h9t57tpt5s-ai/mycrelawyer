// =========================================================
// CREdocket -- Stripe webhook: Case Value Calculator credits + subscriptions
//
// Two independent flows now live in this one webhook:
//
// 1. ONE-TIME CREDIT PACK (original, unchanged): checkout.session.completed
//    with mode "payment" grants ONE_TIME_CREDITS runs by writing a row to
//    public.case_valuation_purchases -- cumulative, never expires.
//
// 2. RECURRING SUBSCRIPTIONS (new, 2026-09-13): Practitioner/Firm tiers.
//    checkout.session.completed with mode "subscription" starts tracking
//    a row in public.case_valuation_subscriptions; customer.subscription.
//    updated/deleted keep that row's period/status in sync on renewal or
//    cancellation. Unlike the pack, this resets each billing period
//    rather than accumulating (see case_valuation_project/
//    schema_subscriptions.sql's header comment for the full design).
//
// This is a CREDIT GRANT / ENTITLEMENT RECORD, not "unlocked forever" --
// the analysis Edge Functions (case-valuation-analyze, lease-clause-
// redline) check both tables at request time to decide what a given
// request is actually allowed to consume.
//
// Deploy: Supabase Dashboard -> Edge Functions -> stripe-case-valuation-webhook
//   -> Code tab -> select all, delete, paste this file's contents, deploy.
//
// Secrets needed (Dashboard -> Edge Functions -> Secrets, project-wide):
//   STRIPE_CASE_VALUATION_WEBHOOK_SECRET  -- unchanged, from the existing
//                              webhook endpoint (Stripe Dashboard ->
//                              Developers -> Webhooks -> this endpoint ->
//                              "Signing secret", starts with whsec_).
//   STRIPE_SECRET_KEY          -- NEW, required for the subscription flow
//                              only (the one-time-pack flow never needed
//                              a real API call -- it only reads fields
//                              already on the checkout session payload).
//                              Subscription events DO need one real API
//                              call (retrieving the just-created
//                              subscription's period/price at checkout
//                              time) since Stripe's webhook payload for
//                              checkout.session.completed doesn't include
//                              subscription period/price details inline.
//                              From Stripe Dashboard -> Developers -> API
//                              keys -> Secret key (starts with sk_live_
//                              or sk_test_). This is a project-wide
//                              secret name -- if any other function ever
//                              needs a real Stripe secret key, reuse this
//                              same one rather than adding another.
//
// IMPORTANT -- register 2 more event types on the EXISTING webhook
// endpoint in the Stripe Dashboard (Developers -> Webhooks -> this
// endpoint -> "+ Select events"), in addition to the checkout.session.
// completed event already configured:
//   customer.subscription.updated
//   customer.subscription.deleted
//
// PRICE_ID_TO_PLAN below is filled in with the real Practitioner/Firm
// Price IDs (2026-09-13). If either plan's price is ever recreated in
// Stripe (not just edited -- a genuinely new Price object), update the
// corresponding entry here or subscription checkouts on the old ID will
// complete in Stripe but this webhook will log an error and skip
// granting access (fails safe, not silently -- see the "Unrecognized
// price ID" branch).
//
// Webhook endpoint URL (unchanged):
//   https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/stripe-case-valuation-webhook
// =========================================================

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// How many analysis runs one Payment Link purchase grants. Change this
// if you change the credit count on the Stripe product -- these two
// need to stay in sync manually since Stripe doesn't pass line-item
// metadata through checkout.session.completed by default.
const ONE_TIME_CREDITS = 10;

// Fill in with real Stripe Price IDs (price_..., not prod_...) once
// created -- see the header comment above. Both fields on each entry are
// used: monthlyCreditAllotment feeds case_valuation_subscriptions'
// monthly_credit_allotment column, and planType is stored as-is (also
// drives the "unlimited full write-ups" unlock in js/auth.js, which
// treats ANY row in case_valuation_subscriptions with status='active' as
// qualifying regardless of which planType -- so a new tier added here
// automatically gets that unlock too, no separate wiring needed there).
const PRICE_ID_TO_PLAN: Record<string, { planType: string; monthlyCreditAllotment: number }> = {
  "price_1UFNnB1g7aNJXW5yl0BpKuj8": { planType: "practitioner", monthlyCreditAllotment: 12 },
  "price_1UFNrH1g7aNJXW5y0CMKqeG1": { planType: "firm", monthlyCreditAllotment: 40 },
};

// Deliberately NOT named STRIPE_WEBHOOK_SECRET -- that name is already
// taken project-wide by the handbook webhook's secret. See header comment.
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_CASE_VALUATION_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Real for the subscription flow (retrieves the just-created subscription
// to read its period/price -- see header comment); the one-time-pack
// flow below still makes no outbound Stripe API call at all, same as
// before. Falls back to a placeholder if STRIPE_SECRET_KEY isn't set yet
// so the one-time-pack flow and signature verification keep working
// during rollout, before that secret is added -- subscription checkouts
// will just fail closed (logged, not silently) until it is.
const stripe = new Stripe(STRIPE_SECRET_KEY || "sk_placeholder_not_used_for_webhook_verification", {
  apiVersion: "2025-02-24.acacia",
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 25; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

// Maps Stripe's subscription status values down to the 3 this app
// actually branches on -- see schema_subscriptions.sql's header comment
// for why the finer-grained Stripe statuses collapse to 'past_due'.
function normalizeStatus(stripeStatus: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "canceled" || stripeStatus === "unpaid") return "canceled";
  return "past_due";
}

async function upsertSubscriptionRow(sub: Stripe.Subscription, userId: string | null, email: string | null) {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? PRICE_ID_TO_PLAN[priceId] : undefined;
  if (!plan) {
    console.error(`Unrecognized Stripe price ID on subscription ${sub.id}: ${priceId} -- fill in PRICE_ID_TO_PLAN. Skipping grant (fails safe, not silently).`);
    return { granted: false, reason: "unrecognized_price" };
  }
  // On renewal/update events there's no userId passed in (see the
  // customer.subscription.updated handler below) -- look up the existing
  // row by stripe_subscription_id instead of re-resolving from email.
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const { data: existing } = await supabaseAdmin
      .from("case_valuation_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    resolvedUserId = existing?.user_id ?? null;
  }
  if (!resolvedUserId) {
    console.warn(`No CREdocket account resolvable for subscription ${sub.id} (email: ${email ?? "unknown"}) -- skipping.`);
    return { granted: false, reason: "no_matching_account" };
  }

  const { error } = await supabaseAdmin
    .from("case_valuation_subscriptions")
    .upsert({
      user_id: resolvedUserId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_customer_email: email,
      plan_type: plan.planType,
      monthly_credit_allotment: plan.monthlyCreditAllotment,
      status: normalizeStatus(sub.status),
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });

  if (error) throw error;
  return { granted: true, planType: plan.planType, userId: resolvedUserId };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    return new Response("Missing signature or webhook secret not configured", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature verification failed:", err);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  try {
    // ---- Subscription lifecycle: renewal / plan change ----------------
    // Stripe sends the full subscription object inline on this event --
    // no API call needed (unlike the initial checkout, below).
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscriptionRow(sub, null, null);
      return new Response(JSON.stringify({ received: true, ...result }), { status: 200 });
    }

    // ---- Subscription lifecycle: cancellation --------------------------
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const { error } = await supabaseAdmin
        .from("case_valuation_subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
      if (error) throw error;
      return new Response(JSON.stringify({ received: true, canceled: sub.id }), { status: 200 });
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, skipped: event.type }), { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid" && session.mode !== "subscription") {
      return new Response(JSON.stringify({ received: true, skipped: "not paid" }), { status: 200 });
    }

    const email = session.customer_details?.email || session.customer_email || null;
    if (!email) {
      console.error("Checkout session completed with no email on it:", session.id);
      return new Response(JSON.stringify({ received: true, error: "no email on session" }), { status: 200 });
    }

    const userId = await findUserIdByEmail(email);
    if (!userId) {
      console.warn(`No CREdocket account found for purchaser email: ${email}`);
      return new Response(JSON.stringify({ received: true, warning: "no matching account", email }), { status: 200 });
    }

    // ---- Subscription checkout (Practitioner/Firm) ---------------------
    if (session.mode === "subscription") {
      if (!session.subscription) {
        console.error("Subscription checkout completed with no subscription ID on session:", session.id);
        return new Response(JSON.stringify({ received: true, error: "no subscription id on session" }), { status: 200 });
      }
      // The ONE real Stripe API call in this whole webhook -- the
      // checkout session payload itself doesn't include the new
      // subscription's period/price, only its ID.
      const sub = await stripe.subscriptions.retrieve(
        typeof session.subscription === "string" ? session.subscription : session.subscription.id,
      );
      const result = await upsertSubscriptionRow(sub, userId, email);
      return new Response(JSON.stringify({ received: true, ...result }), { status: 200 });
    }

    // ---- One-time credit pack checkout (unchanged) ---------------------
    const { error: insertError } = await supabaseAdmin
      .from("case_valuation_purchases")
      .upsert(
        {
          user_id: userId,
          stripe_checkout_session_id: session.id,
          stripe_customer_email: email,
          amount_total: session.amount_total ?? null,
          plan_type: "one_time_credits",
          credits_granted: ONE_TIME_CREDITS,
        },
        { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true },
      );

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ received: true, unlocked: true, userId, creditsGranted: ONE_TIME_CREDITS }), { status: 200 });
  } catch (err) {
    console.error("Failed to process case-valuation webhook event:", err);
    return new Response(JSON.stringify({ received: false, error: String(err) }), { status: 500 });
  }
});
