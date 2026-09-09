// =========================================================
// CREdocket — Settlement Contribution Exchange: submission intake
//
// A signed-in user submits the extracted text of a petition/complaint
// PLUS a non-confidential settlement agreement (or final order/judgment)
// for a real matter. This function extracts structured facts (Haiku,
// cheap), runs an automated confidentiality-clause safety net over the
// settlement text, and writes a PENDING row for human review. It never
// grants credits itself — that only happens via admin-review-contribution
// after a human approves the submission (see that function's own header
// comment for why credits are never auto-granted here).
//
// Trust & safety, read before changing:
// 1. The user must affirmatively attest the settlement isn't subject to
//    a confidentiality/NDA provision (userAttestedNonConfidential) —
//    enforced server-side, not just a disabled submit button client-side.
// 2. That attestation is NOT trusted blindly: settlementText is scanned
//    for common confidentiality-clause language. A hit doesn't
//    auto-reject (a document can mention "confidential" in an unrelated
//    clause, e.g. a confidential-business-information carve-out) — it
//    routes the submission to 'flagged' instead of 'pending_review' so a
//    human reviewer looks at it more carefully before any credit is
//    granted.
// 3. Only EXTRACTED TEXT is stored, never a raw file — no Storage bucket
//    needed for v1. A reviewer reads the stored text directly.
// 4. A lightweight daily submission cap guards against someone spamming
//    the review queue (and burning Claude extraction calls) — separate
//    from and much looser than the Case Value Calculator's credit-based
//    rate limit, since submitting here costs the user nothing.
//
// Deploy: Supabase Dashboard -> Edge Functions -> contribute-settlement
//   -> Code tab -> select all, delete, paste this file's contents, deploy.
// Secrets: reuses the same project-wide ANTHROPIC_API_KEY as
//   case-valuation-analyze. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
//   injected automatically. Also needs RESEND_API_KEY -- the SAME Resend
//   API key already configured as the SMTP password for Supabase Auth's
//   magic-link emails (Sending access, restricted to the credocket.com
//   domain) -- add it as a NEW Edge Function secret under this name; it's
//   not automatically shared from the Auth SMTP settings. Used via
//   Resend's REST API (not SMTP) to notify the admin of a new submission.
//   Missing/invalid key fails silently -- a notification email is a
//   nice-to-have, never a reason to fail the submission itself.
// Schema: run case_valuation_project/schema_settlement_contributions.sql
//   in the Supabase SQL Editor before deploying this function.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.120";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_EMAIL = "jeffnovel@icloud.com";
const SENDER_EMAIL = "no-reply@credocket.com"; // same verified-domain sender as the Auth magic-link emails
const EXTRACTION_MODEL = "claude-haiku-4-5";
const MAX_DOC_CHARS = 40000; // per document — a settlement agreement and a petition are rarely longer than this
const DAILY_SUBMISSION_CAP = 10;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Best-effort review-queue notification via Resend's REST API. Deliberately
// NOT allowed to fail the submission: a contributor's upload already
// succeeded and is sitting safely in the queue by the time this is called,
// so a bad/missing RESEND_API_KEY or a transient Resend outage should never
// turn into a 500 for the person contributing data.
async function sendReviewNotification(item: {
  id: number; category: unknown; jurisdiction: unknown; claimedAmount: unknown; settledAmount: unknown; flagged: boolean;
}) {
  if (!RESEND_API_KEY) {
    // Logged (not just silently skipped) so a missing/empty secret shows up
    // in Edge Function logs instead of looking identical to "email sent
    // fine" from the outside -- this exact gap is what made the first
    // silent-failure report undiagnosable.
    console.error("sendReviewNotification: RESEND_API_KEY is not set -- skipping notification email.");
    return;
  }
  const fmt = (n: unknown) => typeof n === "number" ? "$" + n.toLocaleString("en-US") : "—";
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `CREdocket <${SENDER_EMAIL}>`,
        to: [NOTIFY_EMAIL],
        subject: item.flagged
          ? `[Flagged] New settlement contribution #${item.id} needs review`
          : `New settlement contribution #${item.id} submitted for review`,
        text: [
          "A new settlement contribution was submitted.",
          "",
          `Category: ${item.category || "unclear"}`,
          `Jurisdiction: ${item.jurisdiction || "unclear"}`,
          `Claimed: ${fmt(item.claimedAmount)}`,
          `Settled: ${fmt(item.settledAmount)}`,
          item.flagged ? "\n⚠️ The automated confidentiality scan flagged this one — review the flag reason in the queue before approving." : "",
          "",
          "Review it here: https://credocket.com/admin-settlement-review.html",
        ].join("\n"),
      }),
    });
    // fetch() only rejects on a network-level failure -- a non-2xx HTTP
    // response from Resend (bad/expired key, unverified sender domain, a
    // validation error) resolves normally and would otherwise disappear
    // silently. Logging the body here is the whole reason this was
    // undiagnosable from outside the function -- check Edge Function Logs
    // for "sendReviewNotification: Resend returned" after a test submission.
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "(could not read response body)");
      console.error(`sendReviewNotification: Resend returned ${resp.status} — ${bodyText}`);
    }
  } catch (err) {
    console.error("sendReviewNotification: fetch to Resend failed —", String(err));
  }
}

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

const CATEGORY_SLUGS = [
  "lease-disputes", "lending-foreclosure", "reit-securities", "construction-defect",
  "environmental", "eminent-domain", "zoning-land-use", "premises-liability",
];

const STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

// Nullable-enum/type shapes must use `anyOf: [{type, enum}, {type:"null"}]`
// — the array-form `{type:["string","null"], enum:[...values,null]}`
// shorthand is rejected by Anthropic's structured-output validator (see
// case-valuation-analyze/index.ts for the confirmed error text this was
// worked around from).
function nullableEnum(values: string[]) {
  return { anyOf: [{ type: "string", enum: values }, { type: "null" }] };
}
function nullableString() {
  return { type: ["string", "null"] };
}
function nullableNumber() {
  return { type: ["number", "null"] };
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    category: { ...nullableEnum(CATEGORY_SLUGS), description: "Best-guess litigation category this matter falls under, from the fixed list. Null if genuinely unclear." },
    propertyType: { ...nullableEnum(["office", "retail", "multifamily", "industrial", "hospitality", "mixed-use", "land", "other"]), description: "The commercial real estate property type involved, if determinable." },
    jurisdiction: { ...nullableEnum(STATE_NAMES), description: "The U.S. state (or D.C.) where the matter was litigated." },
    claimedAmount: { ...nullableNumber(), description: "The dollar amount originally claimed/sought in the petition or complaint, if stated." },
    settledAmount: { ...nullableNumber(), description: "The dollar amount actually paid/awarded under the settlement agreement or final order, if stated." },
    keyFactualDrivers: { ...nullableString(), description: "A short (1-2 sentence) neutral summary of the specific facts that most likely drove this outcome (e.g. the specific defect, security failure, contaminant, appraisal dispute, etc.) — for internal benchmarking use, not public display." },
    filedDate: { ...nullableString(), description: "The date the petition/complaint was filed, in YYYY-MM-DD format if determinable." },
    resolvedDate: { ...nullableString(), description: "The date the settlement/order was executed or entered, in YYYY-MM-DD format if determinable." },
    insuranceContribution: { ...nullableString(), description: "A short note on whether/how insurance contributed to the settlement, if mentioned (e.g. 'CGL carrier paid $X of the total'). Null if not mentioned." },
    caseCaption: { ...nullableString(), description: "The full case caption/style (party names), exactly as it appears in the documents." },
    courtOrDocket: { ...nullableString(), description: "The court name and docket/case number, if stated." },
  },
  required: ["category", "propertyType", "jurisdiction", "claimedAmount", "settledAmount", "keyFactualDrivers", "filedDate", "resolvedDate", "insuranceContribution", "caseCaption", "courtOrDocket"],
  additionalProperties: false,
};

// Deliberately broad and over-inclusive — false positives just route to
// human review instead of auto-approval eligibility, which is the safe
// direction to err in. Not a substitute for the reviewer actually reading
// the document; a genuine safety NET, not a gate.
const CONFIDENTIALITY_PATTERNS: RegExp[] = [
  /\bconfidential(ity)?\s+(agreement|provision|clause|terms?|nature)\b/i,
  /\bkeep\s+(the\s+)?terms?\s+(of\s+this\s+(agreement|settlement)\s+)?confidential/i,
  /\bshall\s+not\s+disclose\b/i,
  /\bnon[-\s]?disclosure\b/i,
  /\bconfidential\s+settlement\b/i,
  /\bsealed\s+(settlement|record|by\s+order)\b/i,
  /\bparties\s+agree\s+(that\s+)?(the\s+)?(terms|amount)s?\s+(of\s+this\s+)?(agreement|settlement)\s+(shall\s+|will\s+)?(remain|be\s+kept)\s+confidential/i,
  /\bliquidated\s+damages\s+.{0,40}\bconfidential/i,
];

function scanForConfidentiality(text: string): { detected: boolean; reason: string | null } {
  for (const pattern of CONFIDENTIALITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { detected: true, reason: `Matched confidentiality-clause pattern near: "...${text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + 80)}..."` };
    }
  }
  return { detected: false, reason: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- identify the caller --------------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Invalid or expired session — please sign in again" }, 401);
  }
  const userId = userData.user.id;

  // ---- daily submission cap (spam/abuse guard, not credit-related) -----
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: todayCount, error: todayError } = await supabaseAdmin
    .from("settlement_contributions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneDayAgo);
  if (todayError) return jsonResponse({ error: "Could not verify submission history — try again" }, 500);
  if ((todayCount ?? 0) >= DAILY_SUBMISSION_CAP) {
    return jsonResponse({ error: `You've hit the ${DAILY_SUBMISSION_CAP}-per-day submission limit. Try again tomorrow.`, code: "rate_limited" }, 429);
  }

  // ---- parse + validate the request ------------------------------------
  let body: { petitionText?: string; settlementText?: string; userAttestedNonConfidential?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const petitionText = (body.petitionText || "").trim().slice(0, MAX_DOC_CHARS);
  const settlementText = (body.settlementText || "").trim().slice(0, MAX_DOC_CHARS);
  if (!petitionText || !settlementText) {
    return jsonResponse({ error: "Both the petition/complaint text and the settlement agreement text are required." }, 400);
  }
  if (body.userAttestedNonConfidential !== true) {
    return jsonResponse({ error: "You must certify the settlement is not subject to a confidentiality or non-disclosure provision before submitting." }, 400);
  }

  if (!ANTHROPIC_API_KEY || !anthropic) {
    return jsonResponse({ error: "Settlement contribution isn't fully configured yet — try again later.", code: "not_configured" }, 501);
  }

  // ---- automated confidentiality safety net ----------------------------
  const scan = scanForConfidentiality(settlementText);

  // ---- extraction (Haiku, cheap, structured JSON) ----------------------
  let extracted: Record<string, unknown>;
  try {
    const combined = `=== Petition / Complaint ===\n${petitionText}\n\n=== Settlement Agreement / Final Order ===\n${settlementText}`;
    const resp = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      system: "You extract structured facts from a commercial real estate litigation petition/complaint and its settlement agreement or final order, for a litigation-outcomes benchmarking database. Only extract facts explicitly stated in the documents — output null for anything you can't determine, never guess or infer beyond what's written.",
      messages: [{ role: "user", content: combined }],
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    });
    const text = resp.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) throw new Error("Extraction returned no output");
    extracted = JSON.parse(text);
  } catch (err) {
    return jsonResponse({ error: "Could not process these documents — try again, or contact support if this persists.", detail: String(err) }, 500);
  }

  // ---- insert the pending row -------------------------------------------
  const status = scan.detected ? "flagged" : "pending_review";
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("settlement_contributions")
    .insert({
      user_id: userId,
      category: extracted.category ?? null,
      property_type: extracted.propertyType ?? null,
      jurisdiction: extracted.jurisdiction ?? null,
      claimed_amount: extracted.claimedAmount ?? null,
      settled_amount: extracted.settledAmount ?? null,
      key_factual_drivers: extracted.keyFactualDrivers ?? null,
      filed_date: extracted.filedDate ?? null,
      resolved_date: extracted.resolvedDate ?? null,
      insurance_contribution: extracted.insuranceContribution ?? null,
      case_caption: extracted.caseCaption ?? null,
      court_or_docket: extracted.courtOrDocket ?? null,
      petition_text: petitionText,
      settlement_text: settlementText,
      user_attested_non_confidential: true,
      confidentiality_flag_detected: scan.detected,
      confidentiality_flag_reason: scan.reason,
      status,
    })
    .select("id, status")
    .single();

  if (insertError) {
    return jsonResponse({ error: "Could not save your submission — try again.", detail: insertError.message }, 500);
  }

  await sendReviewNotification({
    id: inserted.id,
    category: extracted.category,
    jurisdiction: extracted.jurisdiction,
    claimedAmount: extracted.claimedAmount,
    settledAmount: extracted.settledAmount,
    flagged: scan.detected,
  });

  return jsonResponse({
    id: inserted.id,
    status: inserted.status,
    extracted: {
      category: extracted.category,
      propertyType: extracted.propertyType,
      jurisdiction: extracted.jurisdiction,
      claimedAmount: extracted.claimedAmount,
      settledAmount: extracted.settledAmount,
      keyFactualDrivers: extracted.keyFactualDrivers,
      filedDate: extracted.filedDate,
      resolvedDate: extracted.resolvedDate,
      insuranceContribution: extracted.insuranceContribution,
    },
    confidentialityFlagged: scan.detected,
  }, 200);
});
