// =========================================================
// CREdocket -- Stripe webhook: unlock the Litigation Value Estimator
//
// Same pattern as stripe-handbook-webhook, retargeted at a different
// product/table. Listens for Stripe's `checkout.session.completed`
// event on the estimator's Payment Link, matches the buyer's checkout
// email to an existing CREdocket account, and grants ONE_TIME_CREDITS
// runs by writing a row to public.case_valuation_purchases -- which
// the client and the analysis Edge Function both check (remaining
// credits = sum(credits_granted) - count of analyses used, all-time,
// since one-time credits don't expire or reset). This is a CREDIT
// GRANT, not "unlocked forever" -- each purchase adds ONE_TIME_CREDITS
// more runs to the buyer's balance.
//
// A future monthly subscription would grant credits that reset each
// billing period instead of accumulating -- not wired up yet. When
// that's built, branch on plan_type ('one_time_credits' vs
// 'monthly_subscription') rather than changing this table's shape.
//
// Note: this gates the UI presentation, not the underlying data --
// the estimator computes entirely client-side (there's no per-state
// gated content to protect via RLS the way the handbook's chapters
// are), so this is the same tradeoff every client-side freemium
// calculator makes. Worth knowing, not a bug.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function
//   name: stripe-case-valuation-webhook
//   paste this file's contents, deploy.
//
// Secrets needed (Dashboard -> Edge Functions -> stripe-case-valuation-webhook
//   -> Secrets):
//   STRIPE_WEBHOOK_SECRET   -- from a NEW Stripe webhook endpoint (Stripe
//                              Dashboard -> Developers -> Webhooks -> Add
//                              endpoint -> URL below -> select event
//                              "checkout.session.completed" -> copy the
//                              "Signing secret", starts with whsec_).
//                              This must be a SEPARATE webhook endpoint
//                              from the handbook's -- each Payment Link's
//                              checkout.session.completed event needs to
//                              land at the function that knows what table
//                              to write to.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
// by Supabase for every Edge Function -- do not set those yourself.
//
// Webhook endpoint URL to register in Stripe:
//   https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/stripe-case-valuation-webhook
// =========================================================

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

// How many analysis runs one Payment Link purchase grants. Change this
// if you change the credit count on the Stripe product -- these two
// need to stay in sync manually since Stripe doesn't pass line-item
// metadata through checkout.session.completed by default.
const ONE_TIME_CREDITS = 10;

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Stripe's SDK needs *some* API key to construct, but this function only
// ever calls stripe.webhooks.constructEventAsync (signature verification,
// no network call to Stripe), so a placeholder is fine here.
const stripe = new Stripe("sk_placeholder_not_used_for_webhook_verification", {
  apiVersion: "2024-06-20",
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

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true, skipped: event.type }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true, skipped: "not paid" }), { status: 200 });
  }

  const email = session.customer_details?.email || session.customer_email || null;
  if (!email) {
    console.error("Checkout session completed with no email on it:", session.id);
    return new Response(JSON.stringify({ received: true, error: "no email on session" }), { status: 200 });
  }

  try {
    const userId = await findUserIdByEmail(email);
    if (!userId) {
      console.warn(`No CREdocket account found for purchaser email: ${email}`);
      return new Response(JSON.stringify({ received: true, warning: "no matching account", email }), { status: 200 });
    }

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
    console.error("Failed to record case-valuation purchase:", err);
    return new Response(JSON.stringify({ received: false, error: String(err) }), { status: 500 });
  }
});
