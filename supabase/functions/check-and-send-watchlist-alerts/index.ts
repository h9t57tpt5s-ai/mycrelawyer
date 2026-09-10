// =========================================================
// CREdocket — Watchlist match alerts
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
};

type Watchlist = {
  id: string; user_id: string; name: string;
  states: string[] | null; categories: string[] | null; keyword: string | null;
};

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

async function sendAlertEmail(toEmail: string, watchlistName: string, c: NewCase) {
  if (!RESEND_API_KEY) {
    console.error("check-and-send-watchlist-alerts: RESEND_API_KEY is not set -- skipping email.");
    return;
  }
  const caseUrl = c.id ? `${SITE_URL}/litigation.html?case=${encodeURIComponent(c.id)}` : `${SITE_URL}/litigation.html`;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `CREdocket <${SENDER_EMAIL}>`,
        to: [toEmail],
        subject: `New match on your "${watchlistName}" watchlist: ${c.title || "a tracked matter"}`,
        text: [
          `A new matter matching your "${watchlistName}" watchlist was just added to CREdocket:`,
          "",
          c.title || "(untitled matter)",
          c.jurisdiction ? `Jurisdiction: ${c.jurisdiction}` : null,
          c.date ? `Date: ${c.date}` : null,
          "",
          c.summary || "",
          "",
          `View it here: ${caseUrl}`,
        ].filter((line) => line !== null).join("\n"),
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "(could not read response body)");
      console.error(`check-and-send-watchlist-alerts: Resend returned ${resp.status} for ${toEmail} -- ${bodyText}`);
    }
  } catch (err) {
    console.error(`check-and-send-watchlist-alerts: fetch to Resend failed for ${toEmail} —`, String(err));
  }
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
    await sendAlertEmail(userData.user.email, w.name, newCase);
    emailsSent++;
  }

  return jsonResponse({ ok: true, matchedWatchlists: matched.length, emailsSent }, 200);
});
