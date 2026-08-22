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
// 2. Verify they have a paid entitlement (case_valuation_purchases).
//    No row -> reject with 402, no Claude call is ever made.
// 3. Verify they're under the per-user monthly analysis cap
//    (case_valuation_analyses, last 30 days). Over the cap -> reject
//    with 429, no Claude call is ever made.
// 4. Only after BOTH checks pass does this function log the attempt
//    and call Claude. The log write happens before the Claude call
//    (reserving the slot), not after -- a failed analysis still
//    counts toward the monthly cap. That's a deliberate choice: it's
//    safer to slightly under-serve a legitimate user on a bad day
//    than to leave a retry loop able to bypass the rate limit.
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
// MONTHLY_ANALYSIS_CAP below is the per-user safety-net limit --
// adjust once real usage patterns are visible.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MONTHLY_ANALYSIS_CAP = 20;

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

  // ---- Step 2: verify a paid entitlement exists (NO Claude call yet) --
  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from("case_valuation_purchases")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (purchaseError) {
    return jsonResponse({ error: "Could not verify access — try again" }, 500);
  }
  if (!purchase) {
    return jsonResponse({
      error: "This feature requires full access to the Litigation Value Estimator.",
      code: "payment_required",
    }, 402);
  }

  // ---- Step 3: verify the caller is under the monthly cap ------------
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", thirtyDaysAgo);

  if (countError) {
    return jsonResponse({ error: "Could not verify usage — try again" }, 500);
  }
  if ((count ?? 0) >= MONTHLY_ANALYSIS_CAP) {
    return jsonResponse({
      error: `You've used all ${MONTHLY_ANALYSIS_CAP} analyses included this month. Contact us if you need more.`,
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
  //   3. Return { extractedFacts, analysis } to the client.

  return jsonResponse({ error: "Not yet implemented" }, 501);
});
