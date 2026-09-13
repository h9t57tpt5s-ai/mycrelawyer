// =========================================================
// CREdocket -- Lease Clause Redline Checker: AI clause analysis
//
// Shares the Case Value Calculator's credit pool by design (per
// explicit product decision): reads/writes the SAME
// case_valuation_purchases and case_valuation_analyses tables, so a
// purchased credit balance and the daily burst cap both apply across
// both tools together, not separately. The `tool` column on
// case_valuation_analyses (added by
// case_valuation_project/schema_analyses_tool_column.sql) distinguishes
// which tool a given usage row came from for reporting only -- it does
// NOT gate anything.
//
// COST-PROTECTION DESIGN mirrors case-valuation-analyze/index.ts
// exactly (see that file's header for the full rationale): identity ->
// credit balance -> daily burst cap -> only then call Claude -> log
// usage (consuming a credit) only on a real completed success.
//
// Unlike the Value Calculator, this is a single Claude call, not a
// two-phase extraction+analysis pipeline -- one clause is a much
// smaller unit of work than a whole case document, and there's no
// deterministic baseline engine to feed here. The schema (and the
// model's own reference thresholds) are built from js/lease-redline-
// data.js's clauseTypes, fetched live at request time (loadRedlineData()
// below) -- adding or changing a clause type there takes effect here
// automatically, no separate copy to keep in sync.
//
// GROUNDING: this analysis is about commercial-leasing market
// drafting practice, not case law -- the model is explicitly
// instructed NOT to cite specific court cases or statutes, since
// there's no citation-pool enforcement mechanism here the way the
// Value Calculator has (resolveCitations dropping any name that
// doesn't match a real entry). Forbidding citations entirely is the
// safe choice over building that enforcement for this tool too.
//
// Deploy: Supabase Dashboard -> Edge Functions -> lease-clause-redline
//   -> Code tab -> select all, delete, paste this file's contents, deploy.
// Secrets: same ANTHROPIC_API_KEY as case-valuation-analyze (project-wide).
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.120";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DAILY_BURST_CAP = 15; // shared with case-valuation-analyze's own cap, since usage rows are shared
const MAX_CLAUSE_CHARS = 8000; // a single lease clause/section, not a whole document
const NARRATIVE_MODEL = "claude-opus-5";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

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

// Fetched live from the deployed site (same pattern as case-valuation-
// analyze's loadCaseData()) rather than duplicated here -- previously this
// was a hand-maintained copy holding only { id, label } per term, so the
// model was only ever told the term NAME, never the actual market-
// standard/landlord-favorable/tenant-favorable reference language the
// client displays right next to its verdict. Fixed 2026-09-13 (10-agent
// premium-readiness review, AI-tools-maturity finding): the reference
// card and the model's own classification could rest on completely
// different unstated thresholds. Fetching the real file instead of
// re-typing it also means this can never drift out of sync again.
const REDLINE_DATA_URL = "https://credocket.com/js/lease-redline-data.js";

type RedlineKeyTerm = { id: string; label: string; marketStandard: string; landlordFavorable: string; tenantFavorable: string };
type RedlineData = { clauseTypes: Record<string, { label: string; keyTerms: RedlineKeyTerm[] }> };

let cachedRedlineData: RedlineData | null = null;
async function loadRedlineData(): Promise<RedlineData> {
  if (cachedRedlineData) return cachedRedlineData;
  const res = await fetch(REDLINE_DATA_URL);
  if (!res.ok) throw new Error(`Could not load lease-redline reference data (${res.status})`);
  const raw = await res.text();
  // js/lease-redline-data.js is genuine JavaScript, not JSON -- same
  // execute-as-JS approach as case-valuation-analyze's loadCaseData(),
  // for the same reason (comments/trailing commas break JSON.parse).
  const fn = new Function(`${raw}\nreturn LEASE_REDLINE_DATA;`);
  cachedRedlineData = fn() as RedlineData;
  return cachedRedlineData;
}

function buildRedlineSchema(terms: RedlineKeyTerm[]) {
  const termProps: Record<string, unknown> = {};
  terms.forEach((t) => {
    termProps[t.id] = {
      type: "object",
      properties: {
        whatTheClauseSays: { type: "string", description: "Quote or closely summarize the language in the uploaded clause addressing this specific term. If the clause doesn't address it at all, say so explicitly rather than guessing." },
        marketComparison: { type: "string", enum: ["market-standard", "favors-landlord", "favors-tenant", "unusual-or-unclear", "not-addressed"] },
        explanation: { type: "string", description: "1-3 sentences on why this classification, from the representing party's perspective." },
      },
      required: ["whatTheClauseSays", "marketComparison", "explanation"],
      additionalProperties: false,
    };
  });
  return {
    type: "object",
    properties: {
      ...termProps,
      overallRiskLevel: { type: "string", enum: ["low", "moderate", "high"], description: "Overall risk to the representing party from how this clause is drafted." },
      topConcerns: { type: "array", items: { type: "string" }, description: "The 2-4 most important issues to flag for the representing party, most important first. Empty array if genuinely no concerns." },
      suggestedRevisions: {
        type: "array",
        items: {
          type: "object",
          properties: { issue: { type: "string" }, suggestion: { type: "string" } },
          required: ["issue", "suggestion"],
          additionalProperties: false,
        },
        description: "Concrete redline suggestions, one per issue worth revising. Empty array if none.",
      },
      narrative: { type: "string", description: "A comprehensive written analysis of the clause as a whole, written like a real estate attorney's markup memo to the represented party -- direct and specific." },
    },
    required: [...Object.keys(termProps), "overallRiskLevel", "topConcerns", "suggestedRevisions", "narrative"],
    additionalProperties: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!anthropic) {
    return jsonResponse({ error: "This feature isn't configured yet -- try again shortly.", code: "not_configured" }, 501);
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

  // ---- Step 2: credit balance -- SHARED with the Value Calculator ------
  const { data: purchases, error: purchaseError } = await supabaseAdmin
    .from("case_valuation_purchases")
    .select("credits_granted")
    .eq("user_id", userId);
  if (purchaseError) {
    return jsonResponse({ error: "Could not verify access — try again" }, 500);
  }
  const totalCredits = (purchases ?? []).reduce((sum, p) => sum + (p.credits_granted ?? 0), 0);
  if (totalCredits === 0) {
    return jsonResponse({ error: "This feature requires purchasing analysis credits (shared with the Case Value Calculator).", code: "payment_required" }, 402);
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
    return jsonResponse({ error: "You've used all your purchased analysis credits. Purchase more to continue.", code: "no_credits_remaining" }, 402);
  }

  // ---- Step 3: daily burst cap, shared across both tools --------------
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
    return jsonResponse({ error: `You've hit the ${DAILY_BURST_CAP}-per-day request limit (shared with the Case Value Calculator). Try again tomorrow.`, code: "rate_limited" }, 429);
  }

  // ---- Step 4: validate the request -----------------------------------
  let requestBody: { clauseText?: string; clauseType?: string; representingParty?: "Landlord" | "Tenant" };
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  if (!requestBody.clauseText) {
    return jsonResponse({ error: "No clause text provided" }, 400);
  }
  const redlineData = await loadRedlineData();
  const clauseSpec = requestBody.clauseType ? redlineData.clauseTypes[requestBody.clauseType] : null;
  if (!clauseSpec) {
    return jsonResponse({ error: "Unrecognized clause type" }, 400);
  }
  if (requestBody.representingParty !== "Landlord" && requestBody.representingParty !== "Tenant") {
    return jsonResponse({ error: "representingParty must be \"Landlord\" or \"Tenant\"" }, 400);
  }
  const clauseText = requestBody.clauseText.length > MAX_CLAUSE_CHARS
    ? requestBody.clauseText.slice(0, MAX_CLAUSE_CHARS)
    : requestBody.clauseText;

  const schema = buildRedlineSchema(clauseSpec.keyTerms);

  // The site's own curated reference thresholds, spelled out for the
  // model term by term -- previously the model only ever saw the term
  // NAME and had to guess "market practice" independently, which could
  // (and had no way not to) diverge from the specific numbers the client
  // shows the user right next to the model's own verdict.
  const referenceText = clauseSpec.keyTerms.map((t) =>
    `- ${t.label}:\n  Market standard: ${t.marketStandard}\n  Landlord-favorable: ${t.landlordFavorable}\n  Tenant-favorable: ${t.tenantFavorable}`
  ).join("\n");

  try {
    const stream = anthropic.messages.stream({
      model: NARRATIVE_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system:
        "You are an experienced commercial real estate attorney reviewing one specific lease clause for the party you represent -- not a legal opinion, not an adjudication, and not legal advice. " +
        `Analyze the "${clauseSpec.label}" clause below against general institutional commercial-leasing market practice, from the perspective of the party you represent. ` +
        "For each key term listed in the schema, quote or closely summarize what the actual clause says about it, classify it against market practice, and explain why -- from the represented party's perspective specifically (a landlord-favorable term is a concern when representing the tenant, and vice versa). " +
        `REFERENCE THRESHOLDS -- use these specific, curated definitions of market-standard/landlord-favorable/tenant-favorable for each term below as your classification anchor, not your own independent sense of "market practice." The user sees this exact reference language displayed alongside your verdict, so your classification must be consistent with it:\n${referenceText}\n\n` +
        "GROUNDING REQUIREMENT: do not cite, invent, or reference any specific court case, statute, or regulation -- this analysis is about market drafting practice only, not case law. If a term genuinely isn't addressed by the clause at all, say so plainly rather than guessing what it might mean. " +
        "Write the narrative like a real markup memo to the client: direct, specific, and focused on what actually matters in this clause, not generic boilerplate about the clause type in general.",
      messages: [{
        role: "user",
        content: `Clause type: ${clauseSpec.label}\nRepresenting: ${requestBody.representingParty}\n\n=== The clause to analyze ===\n${clauseText}`,
      }],
    });
    const message = await stream.finalMessage();
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock?.text) {
      throw new Error(`Analysis pass returned no output (stop_reason: ${message.stop_reason}, content blocks: ${message.content.map((b) => b.type).join(",")})`);
    }
    const parsed = JSON.parse(textBlock.text);

    // Only now, with a real completed analysis about to go back to the
    // user, does this consume a credit (see the design note at the top
    // of this file, mirroring case-valuation-analyze exactly).
    const { error: logError } = await supabaseAdmin
      .from("case_valuation_analyses")
      .insert({ user_id: userId, category: requestBody.clauseType, tool: "lease-redline" });
    if (logError) console.error("Failed to log completed analysis (credit not deducted):", logError);

    return jsonResponse({
      clauseType: requestBody.clauseType,
      clauseTypeLabel: clauseSpec.label,
      representingParty: requestBody.representingParty,
      analysis: parsed,
    }, 200);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth error — check ANTHROPIC_API_KEY:", err);
      return jsonResponse({ error: "Analysis is temporarily unavailable — try again shortly.", code: "upstream_auth_error" }, 502);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return jsonResponse({ error: "The analysis service is busy — try again in a minute.", code: "upstream_rate_limited" }, 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err);
      return jsonResponse({ error: "Analysis failed — try again.", code: "upstream_error" }, 502);
    }
    console.error("lease-clause-redline error:", err);
    return jsonResponse({ error: "Something went wrong analyzing this clause — try again.", code: "internal_error" }, 500);
  }
});
