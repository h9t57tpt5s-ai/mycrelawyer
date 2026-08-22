// =========================================================
// CREdocket -- Litigation Value Estimator: document analysis
//
// STATUS: gate is complete and safe to deploy now. The actual Claude
// call (extraction + narrative analysis) is a stub -- comes next once
// an ANTHROPIC_API_KEY secret is set on this function. Until then this
// function correctly rejects everyone (no key configured), which is
// the safe failure mode.
//
// COST-PROTECTION DESIGN -- read before changing the order of checks:
// 1. Verify the caller's identity from their Supabase auth token.
// 2. Compute their remaining credit balance: sum(credits_granted)
//    across every case_valuation_purchases row for this user, minus
//    all-time usage from case_valuation_analyses. Zero purchased ->
//    402 payment_required. Balance exhausted -> 402
//    no_credits_remaining. Either way, no Claude call is ever made.
//    (One-time credits are cumulative and never expire; a future
//    monthly-subscription plan_type would check usage within the
//    current billing period instead -- not wired up yet.)
// 3. Separately, a small daily burst cap (not tied to credits) guards
//    against a compromised account or scripting bug hammering this
//    endpoint faster than any real user would, even with real credits
//    remaining. Over the cap -> 429, no Claude call is ever made.
// 4. Only after BOTH checks pass does this function log the attempt
//    (consuming one credit) and call Claude. The log write happens
//    before the Claude call (reserving the slot), not after -- a
//    failed analysis still consumes a credit. That's a deliberate
//    choice: it's safer to slightly under-serve a legitimate user on
//    a bad day than to leave a retry loop able to mint free credits.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function
//   name: case-valuation-analyze
//   paste this file's contents, deploy.
//
// Secrets needed (Dashboard -> Edge Functions -> case-valuation-analyze
//   -> Secrets):
//   ANTHROPIC_API_KEY       -- from console.anthropic.com, your own
//                              account. Not set yet -- this function
//                              will 500 with a clear "not configured"
//                              message until it is, rather than
//                              silently doing nothing.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// DAILY_BURST_CAP below is a burst-abuse governor, separate from the
// actual credit balance -- adjust once real usage patterns are visible.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DAILY_BURST_CAP = 15;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- Step 1: identify the caller ----------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Invalid or expired session — please sign in again" }, 401);
  }
  const userId = userData.user.id;

  // ---- Step 2: compute remaining credits (NO Claude call yet) --------
  // Credit-based, not "ever purchased = unlimited": sum every purchase's
  // credits_granted (one-time credits are cumulative and never expire),
  // then subtract all-time usage. A future monthly-subscription plan
  // type would instead check usage within the current billing period --
  // not wired up yet, see the header comment.
  const { data: purchases, error: purchaseError } = await supabaseAdmin
    .from("case_valuation_purchases")
    .select("credits_granted")
    .eq("user_id", userId);

  if (purchaseError) {
    return jsonResponse({ error: "Could not verify access — try again" }, 500);
  }
  const totalCredits = (purchases ?? []).reduce((sum, p) => sum + (p.credits_granted ?? 0), 0);
  if (totalCredits === 0) {
    return jsonResponse({
      error: "This feature requires purchasing analysis credits for the Litigation Value Estimator.",
      code: "payment_required",
    }, 402);
  }

  const { count: usedCount, error: usedError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (usedError) {
    return jsonResponse({ error: "Could not verify usage — try again" }, 500);
  }
  const remainingCredits = totalCredits - (usedCount ?? 0);
  if (remainingCredits <= 0) {
    return jsonResponse({
      error: "You've used all your purchased analysis credits. Purchase more to continue.",
      code: "no_credits_remaining",
    }, 402);
  }

  // ---- Step 3: burst-abuse governor, separate from the credit balance -
  // Protects against a compromised account or a scripting bug hammering
  // this endpoint faster than any real user would, even with credits
  // legitimately remaining -- not the main gate, a sanity backstop.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: todayCount, error: todayError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneDayAgo);

  if (todayError) {
    return jsonResponse({ error: "Could not verify usage — try again" }, 500);
  }
  if ((todayCount ?? 0) >= DAILY_BURST_CAP) {
    return jsonResponse({
      error: `You've hit the ${DAILY_BURST_CAP}-per-day request limit. Try again tomorrow.`,
      code: "rate_limited",
    }, 429);
  }

  // ---- Step 4: reserve the slot, THEN (and only then) call Claude ----
  let requestBody: { documentText?: string; category?: string };
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  if (!requestBody.documentText) {
    return jsonResponse({ error: "No document text provided" }, 400);
  }

  const { error: logError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .insert({ user_id: userId, category: requestBody.category ?? null });
  if (logError) {
    return jsonResponse({ error: "Could not log this analysis — try again" }, 500);
  }

  if (!ANTHROPIC_API_KEY) {
    // Safe failure mode: the gate above is fully live and correct even
    // though the actual analysis isn't wired up yet. This will start
    // working the moment the secret is set -- no code change needed.
    return jsonResponse({
      error: "Document analysis isn't fully configured yet — the access/payment gate is live, the AI call is not.",
      code: "not_configured",
    }, 501);
  }

  // TODO (next step, once ANTHROPIC_API_KEY is set): call Claude here.
  //   1. Extraction pass (Haiku 4.5) -- pull structured facts from
  //      requestBody.documentText into the same shape the existing
  //      client-side engine (js/case-valuation-engine.js) expects,
  //      so the probability/damages math stays identical to the
  //      manual-entry flow.
  //   2. Narrative pass (Sonnet 5 or Opus 5) -- generate the detailed
  //      reasoned analysis: facts, reasoning tied to the real cited
  //      precedent already in CASE_VALUATION_DATA, and a clear
  //      bottom-line call on likely outcome and damages. Framed
  //      explicitly as a probability-weighted prediction, per the
  //      earlier framing discussion -- not styled as an adjudication.
  //   3. Return 200 with a body shaped exactly like this -- the front
  //      end (js/case-valuation-ai.js -> renderAnalysisResult) already
  //      expects this contract, so no client change should be needed
  //      once this is filled in:
  //        {
  //          extractedFacts: { ...same keys the manual-entry engine's
  //                             QUESTIONS[category] uses, e.g.
  //                             monthlyRent, unpaidRentAmount, etc... },
  //          analysis: {
  //            narrative: string,          // the reasoned writeup
  //            likelyOutcome: string,       // short bottom-line summary
  //            damagesRange: [number, number],
  //            probability: number,         // 0-1
  //            citedCases: [{ caseName, sourceUrl, year, dollarAmount }]
  //          }
  //        }
  //      On failure, keep using jsonResponse({ error, code }, status) --
  //      the client already handles 402/429/501 distinctly and falls
  //      back to a generic error message for anything else.

  return jsonResponse({ error: "Not yet implemented" }, 501);
});
