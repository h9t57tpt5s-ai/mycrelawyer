// =========================================================
// CREdocket -- Stripe webhook: unlock the Commercial Eviction Handbook
//
// Listens for Stripe's `checkout.session.completed` event on the
// handbook's Payment Link, matches the buyer's checkout email to an
// existing CREdocket account, and writes a row to
// public.handbook_purchases -- which is what unlocks the gated
// chapters in eviction-guide.html via that table's RLS policy.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function
//   name: stripe-handbook-webhook
//   paste this file's contents, deploy.
//
// Secrets needed (Dashboard -> Edge Functions -> stripe-handbook-webhook
//   -> Secrets, or Project Settings -> Edge Functions -> Secrets):
//   STRIPE_WEBHOOK_SECRET   -- from the Stripe webhook endpoint you create
//                              (Stripe Dashboard -> Developers -> Webhooks
//                              -> Add endpoint -> URL below -> select event
//                              "checkout.session.completed" -> copy the
//                              "Signing secret", starts with whsec_).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
// by Supabase for every Edge Function -- do not set those yourself.
//
// Webhook endpoint URL to register in Stripe:
//   https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/stripe-handbook-webhook
// =========================================================

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  // admin.listUsers doesn't support filtering by email directly in all
  // supabase-js versions, so page through and match -- fine at this scale.
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 25; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null; // last page
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
    // Not an error -- just nothing to do for this event type.
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
      // Buyer paid but doesn't have (or hasn't yet created) a CREdocket
      // account under this email. Record nothing now -- there's no user_id
      // to attach to. The buyer should sign up / sign in with this same
      // email; consider building a "claim my purchase" reconciliation flow
      // if this turns out to happen often.
      console.warn(`No CREdocket account found for purchaser email: ${email}`);
      return new Response(JSON.stringify({ received: true, warning: "no matching account", email }), { status: 200 });
    }

    const { error: insertError } = await supabaseAdmin
      .from("handbook_purchases")
      .upsert(
        {
          user_id: userId,
          stripe_checkout_session_id: session.id,
          stripe_customer_email: email,
          amount_total: session.amount_total ?? null,
        },
        { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true },
      );

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ received: true, unlocked: true, userId }), { status: 200 });
  } catch (err) {
    console.error("Failed to record handbook purchase:", err);
    // Return 500 so Stripe retries this webhook delivery.
    return new Response(JSON.stringify({ received: false, error: String(err) }), { status: 500 });
  }
});
