// =========================================================
// CREdocket — Watchlist + portfolio-entity match alerts
//
// Called once per newly-synced case by
// .github/workflows/supabase-sync.yml, right after that case lands in
// public.case_data -- never called directly by end users or the
// browser. Checks every saved watchlist for a match against the new
// case using the SAME matching rules as js/watchlists.js's own
// findMatches() (states / categories / keyword, empty filter = matches
// everything), and emails each matching watchlist's owner a same-day
// alert via Resend, linking straight to the matter via
// litigation.html?case=<id>.
//
// ALSO (added 2026-09-14, the #1 finding from the 100-persona
// stakeholder review -- see case_valuation_project/schema_portfolio_
// entities.sql) checks every user's saved portfolio_entities -- their
// own named properties, tenants, lenders, guarantors, and other
// counterparties -- against the new case's `parties[].name` when
// present, falling back to a substring match against the case title
// when it isn't (as of 2026-09-14, `parties` is a very new field the
// digest pipeline is only asked to populate going forward, so most
// existing and even many new cases won't have it yet -- the title
// fallback is what makes this actually useful before that catches up,
// since virtually every case title already names at least one real
// party). Emails each matched entity's owner separately from any
// watchlist match, using the same Resend pattern.
//
// ALSO (added 2026-09-16, follow-up to the same review: reviewers across
// nearly every persona flagged that a false negative here is "worse than
// no tool" because a silent "no alert" is ambiguous between "no risk" and
// "missed match" -- see getPortfolioMatchMethod below) every alert email
// now states plainly HOW the match was found: a portfolio-entity alert
// says whether it came from structured party data or only an unverified
// title-text mention, and a watchlist alert notes when its optional
// keyword filter (a text search, not structured data) was part of the
// match. This does not change what counts as a match, only what the
// recipient is told about it.
//
// Auth model: a single shared secret (AUTOMATION_SECRET), checked
// against the x-automation-secret header the sync workflow already
// sends -- this endpoint has no browser caller, so there's no user JWT
// to check. Fails CLOSED (rejects) if the secret isn't configured at
// all, so an unset secret can never accidentally let an unauthenticated
// caller trigger real alert emails to real users.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function -> name
//   it exactly "check-and-send-watchlist-alerts" -> Code tab -> paste
//   this file's contents -> Deploy.
// Secrets needed:
//   AUTOMATION_SECRET -- must exactly match the GitHub Actions secret of
//     the same name already referenced in supabase-sync.yml. If that
//     GitHub secret doesn't exist yet, generate one (e.g. at
//     https://generate-secret.vercel.app/32) and set the SAME value in
//     both places: GitHub repo Settings -> Secrets and variables ->
//     Actions -> New repository secret -> name it AUTOMATION_SECRET,
//     and here as a Supabase Edge Function secret of the same name.
//   RESEND_API_KEY -- already configured for other notification emails.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -- auto-injected.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SENDER_EMAIL = "no-reply@credocket.com";
const SITE_URL = "https://credocket.com";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type NewCase = {
  id?: string; title?: string; category?: string; state?: string;
  summary?: string; significance?: string; jurisdiction?: string; date?: string;
  parties?: { name: string; role: string }[];
};

type Watchlist = {
  id: string; user_id: string; name: string;
  states: string[] | null; categories: string[] | null; keyword: string | null;
};

type PortfolioEntity = {
  id: string; user_id: string; entity_name: string; entity_type: string;
};

// Case-insensitive, whitespace-normalized comparison, tolerant of one
// name being a prefix/suffix of the other (e.g. a user saving "Willow
// Bridge Property Co." should match a party recorded as "Willow Bridge
// Property Company" or vice versa) -- deliberately not a fuzzy/typo-
// tolerant match beyond that, since a looser match on short names risks
// false-positive alerts (a real trust cost) more than it risks missing
// a genuine hit.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Match-method transparency (added 2026-09-16, the #1 finding from the
// 100-persona stakeholder review's follow-up pass: "no alert" is
// ambiguous between "no risk" and "missed match" because the underlying
// mechanism -- structured party data vs. a plain title substring -- was
// invisible to the user. As of this date, ZERO of the 147 currently
// tracked matters in js/data.js have the structured `parties` field
// populated (it was only introduced 2026-09-14, added going forward on
// new entries only per scripts/re-legal-news-digest-prompt.md), so in
// practice every portfolio-entity match today is a title-substring
// match, not a structured one. This does NOT change the matching logic
// itself -- only reports which path fired, so it can be surfaced to the
// user instead of hidden.
type PortfolioMatchMethod = "structured" | "title" | null;

function getPortfolioMatchMethod(entity: PortfolioEntity, c: NewCase): PortfolioMatchMethod {
  const normEntity = normalizeName(entity.entity_name);
  if (c.parties && c.parties.length) {
    if (c.parties.some((p) => namesMatch(p.name, entity.entity_name))) return "structured";
  }
  // Fallback: most cases don't have structured `parties` yet, but nearly
  // every case title names at least one real party (e.g. "Gunwerks, LLC
  // v. Forward Cody Wyoming, Inc.") -- a plain substring check against
  // the title catches those without needing the structured field. Guarded
  // to entity names of real length (>= 6 normalized characters) so a
  // short/generic saved name (e.g. "Bank", "LLC") can't fire on every
  // unrelated case that happens to contain that substring -- a wrong
  // alert costs more trust than a missed short-name match does.
  if (normEntity.length >= 6 && c.title && normalizeName(c.title).includes(normEntity)) return "title";
  return null;
}

// Mirrors js/watchlists.js's findMatches() filter logic exactly -- an
// empty/unset filter dimension matches everything, matching that file's
// own "All matters" fallback semantics.
function matchesWatchlist(w: Watchlist, c: NewCase): boolean {
  if (w.states && w.states.length) {
    if (!c.state || !w.states.includes(c.state)) return false;
  }
  if (w.categories && w.categories.length) {
    if (!c.category || !w.categories.includes(c.category)) return false;
  }
  if (w.keyword && w.keyword.trim()) {
    const kw = w.keyword.trim().toLowerCase();
    const haystack = `${c.title || ""} ${c.summary || ""} ${c.significance || ""}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  return true;
}

async function sendEmail(toEmail: string, subject: string, bodyLines: (string | null)[], campaign: string) {
  if (!RESEND_API_KEY) {
    console.error("check-and-send-watchlist-alerts: RESEND_API_KEY is not set -- skipping email.");
    return;
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `CREdocket <${SENDER_EMAIL}>`,
        to: [toEmail],
        subject,
        text: bodyLines.filter((line) => line !== null).join("\n"),
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "(could not read response body)");
      console.error(`check-and-send-watchlist-alerts: Resend returned ${resp.status} for ${toEmail} (${campaign}) -- ${bodyText}`);
    }
  } catch (err) {
    console.error(`check-and-send-watchlist-alerts: fetch to Resend failed for ${toEmail} (${campaign}) —`, String(err));
  }
}

// UTM params so each click shows up as its own traffic source in Vercel
// Analytics instead of vanishing into "direct, no referrer" -- email
// clients generally don't forward a Referrer header at all, so without
// these, an alerted user clicking through from their inbox is
// indistinguishable from someone who just typed the URL (or a bot).
function caseUrl(c: NewCase, campaign: string): string {
  const utm = `utm_source=credocket&utm_medium=email&utm_campaign=${campaign}`;
  return c.id
    ? `${SITE_URL}/litigation.html?case=${encodeURIComponent(c.id)}&${utm}`
    : `${SITE_URL}/litigation.html?${utm}`;
}

async function sendWatchlistAlertEmail(toEmail: string, watchlistName: string, c: NewCase, usedKeywordMatch: boolean) {
  // A watchlist's state/category filters are exact matches against
  // structured fields -- no ambiguity there. Its optional keyword filter,
  // though, is a plain substring search against this matter's title/
  // summary/significance text (see matchesWatchlist above), which is the
  // same kind of unverified text match the portfolio-entity fallback
  // uses -- surfaced here so a keyword-based match isn't silently treated
  // as more certain than it is.
  const matchMethodLine = usedKeywordMatch
    ? `Match method: found via a text search for your watchlist's keyword in this matter's title/summary -- not checked against structured party data. Confirm the party/company is actually involved before treating this as confirmed.`
    : null;
  await sendEmail(
    toEmail,
    `New match on your "${watchlistName}" watchlist: ${c.title || "a tracked matter"}`,
    [
      `A new matter matching your "${watchlistName}" watchlist was just added to CREdocket:`,
      "",
      c.title || "(untitled matter)",
      c.jurisdiction ? `Jurisdiction: ${c.jurisdiction}` : null,
      c.date ? `Date: ${c.date}` : null,
      "",
      c.summary || "",
      "",
      matchMethodLine,
      matchMethodLine ? "" : null,
      `View it here: ${caseUrl(c, "watchlist-alert")}`,
    ],
    "watchlist-alert",
  );
}

async function sendPortfolioAlertEmail(toEmail: string, entityName: string, c: NewCase, matchMethod: PortfolioMatchMethod) {
  // Match-confidence disclosure (see getPortfolioMatchMethod's comment
  // above): tells the recipient plainly whether this alert came from
  // this matter's structured party/role data (high confidence) or only
  // from the entity's name appearing as a substring of the matter's
  // title (lower confidence, unverified) -- so "matched" doesn't read as
  // more certain than it is, and by the same logic a user can treat "no
  // alert" for a matter they later find through other means as a real
  // coverage gap rather than assume the tool would have caught it.
  const confidenceLine = matchMethod === "structured"
    ? `Match confidence: High -- "${entityName}" appears in this matter's structured party/role data.`
    : `Match confidence: Lower -- "${entityName}" was found only as a text mention in this matter's title. This matter doesn't yet have structured party data, so this hasn't been verified as the same entity in the same role. Please confirm manually.`;
  await sendEmail(
    toEmail,
    `"${entityName}" was just named in a new CREdocket matter`,
    [
      `A new matter naming "${entityName}" -- something in your CREdocket portfolio -- was just added:`,
      "",
      c.title || "(untitled matter)",
      c.jurisdiction ? `Jurisdiction: ${c.jurisdiction}` : null,
      c.date ? `Date: ${c.date}` : null,
      "",
      c.summary || "",
      "",
      confidenceLine,
      "",
      `View it here: ${caseUrl(c, "portfolio-alert")}`,
      "",
      `Manage what's in your portfolio: ${SITE_URL}/account.html`,
    ],
    "portfolio-alert",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const provided = req.headers.get("x-automation-secret") ?? "";
  if (!AUTOMATION_SECRET || provided !== AUTOMATION_SECRET) {
    return jsonResponse({ error: "Invalid automation secret" }, 401);
  }

  let newCase: NewCase;
  try {
    newCase = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const { data: watchlists, error: wErr } = await supabaseAdmin
    .from("watchlists")
    .select("id, user_id, name, states, categories, keyword");
  if (wErr) {
    console.error("check-and-send-watchlist-alerts: failed to load watchlists —", wErr.message);
    return jsonResponse({ error: "Could not load watchlists" }, 500);
  }

  const matched = ((watchlists || []) as Watchlist[]).filter((w) => matchesWatchlist(w, newCase));
  let emailsSent = 0;
  for (const w of matched) {
    const { data: userData, error: uErr } = await supabaseAdmin.auth.admin.getUserById(w.user_id);
    if (uErr || !userData || !userData.user || !userData.user.email) {
      console.error(`check-and-send-watchlist-alerts: could not resolve email for user ${w.user_id} —`, uErr?.message);
      continue;
    }
    const usedKeywordMatch = Boolean(w.keyword && w.keyword.trim());
    await sendWatchlistAlertEmail(userData.user.email, w.name, newCase, usedKeywordMatch);
    emailsSent++;
  }

  // Portfolio-entity matching -- a separate table/concept from
  // watchlists (see this file's header comment). A table that doesn't
  // exist yet (schema not run) fails this query gracefully rather than
  // 500ing the whole request, so watchlist alerts keep working even
  // before Jeff runs schema_portfolio_entities.sql.
  const { data: entities, error: peErr } = await supabaseAdmin
    .from("portfolio_entities")
    .select("id, user_id, entity_name, entity_type");
  let matchedEntityCount = 0;
  if (peErr) {
    console.error("check-and-send-watchlist-alerts: failed to load portfolio_entities (table may not exist yet) —", peErr.message);
  } else {
    const matchedEntities = ((entities || []) as PortfolioEntity[])
      .map((e) => ({ entity: e, method: getPortfolioMatchMethod(e, newCase) }))
      .filter((m) => m.method !== null);
    matchedEntityCount = matchedEntities.length;
    for (const { entity: e, method } of matchedEntities) {
      const { data: userData, error: uErr } = await supabaseAdmin.auth.admin.getUserById(e.user_id);
      if (uErr || !userData || !userData.user || !userData.user.email) {
        console.error(`check-and-send-watchlist-alerts: could not resolve email for user ${e.user_id} —`, uErr?.message);
        continue;
      }
      await sendPortfolioAlertEmail(userData.user.email, e.entity_name, newCase, method);
      emailsSent++;
    }
  }

  return jsonResponse({ ok: true, matchedWatchlists: matched.length, matchedPortfolioEntities: matchedEntityCount, emailsSent }, 200);
});
