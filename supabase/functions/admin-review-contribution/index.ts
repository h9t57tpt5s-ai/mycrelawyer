// =========================================================
// CREdocket — Settlement Contribution Exchange: admin review
//
// Admin-only. Lists pending/flagged submissions for human review, and
// approves or rejects them. Approval is the ONLY place credits are ever
// granted for a contribution — never at submission time (see
// contribute-settlement/index.ts's header comment) — because the whole
// point of a credits-for-data exchange is that the data has to actually
// be real, non-confidential, and usable before it's worth anything.
//
// Auth model: hard-coded single-admin email check, not a role/permissions
// table — appropriate for a single-operator site at this stage. If a
// second reviewer is ever added, replace ADMIN_EMAILS with a lookup
// against a proper admin table instead of extending this list.
//
// Deploy: Supabase Dashboard -> Edge Functions -> admin-review-contribution
//   -> Code tab -> select all, delete, paste this file's contents, deploy.
// Secrets: none beyond the auto-injected SUPABASE_URL /
//   SUPABASE_SERVICE_ROLE_KEY.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ADMIN_EMAILS = ["jeffnovel@icloud.com"];
const DEFAULT_CREDITS_PER_APPROVAL = 3;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Invalid or expired session — please sign in again" }, 401);
  }
  const email = (userData.user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }
  const adminUserId = userData.user.id;

  let body: { action?: string; id?: number; creditsToGrant?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (body.action === "list_pending") {
    const { data, error } = await supabaseAdmin
      .from("settlement_contributions")
      .select("*")
      .in("status", ["pending_review", "flagged"])
      .order("created_at", { ascending: true });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ items: data }, 200);
  }

  if (body.action === "approve") {
    if (!body.id) return jsonResponse({ error: "Missing id" }, 400);
    const credits = typeof body.creditsToGrant === "number" && body.creditsToGrant > 0
      ? Math.floor(body.creditsToGrant)
      : DEFAULT_CREDITS_PER_APPROVAL;

    const { data: contribution, error: fetchError } = await supabaseAdmin
      .from("settlement_contributions")
      .select("id, user_id, status")
      .eq("id", body.id)
      .single();
    if (fetchError || !contribution) return jsonResponse({ error: "Contribution not found" }, 404);
    if (contribution.status === "approved") return jsonResponse({ error: "Already approved" }, 409);

    const { error: updateError } = await supabaseAdmin
      .from("settlement_contributions")
      .update({
        status: "approved",
        credits_awarded: credits,
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);

    // Grants credits through the SAME table the Case Value Calculator's
    // paid purchases use — checkEntitlement()/getCreditBalance() on the
    // client just sum credits_granted across every row for the user
    // regardless of plan_type, so this slots in with zero client changes.
    const { error: creditError } = await supabaseAdmin
      .from("case_valuation_purchases")
      .insert({
        user_id: contribution.user_id,
        plan_type: "contribution_credit",
        credits_granted: credits,
      });
    if (creditError) {
      // The status update already succeeded — surface this clearly rather
      // than silently leaving the contributor uncredited.
      return jsonResponse({ error: `Approved, but credit grant failed: ${creditError.message}. Grant manually.` }, 500);
    }

    return jsonResponse({ ok: true, id: body.id, creditsGranted: credits }, 200);
  }

  if (body.action === "reject") {
    if (!body.id) return jsonResponse({ error: "Missing id" }, 400);
    const { error: updateError } = await supabaseAdmin
      .from("settlement_contributions")
      .update({
        status: "rejected",
        rejection_reason: body.reason || "Did not meet contribution requirements.",
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);
    return jsonResponse({ ok: true, id: body.id }, 200);
  }

  return jsonResponse({ error: "Unknown action — expected list_pending, approve, or reject" }, 400);
});
