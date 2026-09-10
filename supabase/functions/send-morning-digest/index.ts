// Supabase Edge Function: send-morning-digest
//
// The "start your day here" product (item 11). Runs on a schedule (set up
// via pg_cron, see the SQL below) — no external caller needed day to day,
// though it's still protected by the same shared secret for safety.
//
// Sends every registered user a summary of matters/trends added in roughly
// the last day. If a user has watchlists, matches against those are called
// out first; everyone also gets the day's top new items generally, so this
// is useful even for accounts with no watchlist yet.
//
// Deploy the same way as check-and-send-watchlist-alerts. Reuses the same
// AUTOMATION_SECRET and RESEND_API_KEY secrets — no new secrets needed.
//
// NOTE: this function previously existed only in the Supabase dashboard,
// never checked into the repo -- brought under version control here so
// future changes (like the UTM tagging below) go through the same
// fetch/review/push/redeploy discipline as every other function.

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// UTM params for every link in this email -- without them, a click from an
// email client (most of which never forward a Referrer header at all) is
// indistinguishable in analytics from direct/typed traffic or a bot. Same
// convention as check-and-send-watchlist-alerts, with its own campaign
// name so the two email types are told apart.
const UTM = "utm_source=credocket&utm_medium=email&utm_campaign=morning-digest";

function watchlistMatches(w: any, c: any): boolean {
  if (w.states?.length && !w.states.includes(c.state)) return false;
  if (w.categories?.length && !w.categories.includes(c.category)) return false;
  if (w.keyword) {
    const kw = w.keyword.toLowerCase();
    const haystack = `${c.title} ${c.summary}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (!w.states?.length && !w.categories?.length && !w.keyword) return false;
  return true;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CREdocket <no-reply@credocket.com>", to, subject, html })
  });
  return res.ok;
}

// Each case title is now a deep link straight to that matter (same
// litigation.html?case=<id> pattern check-and-send-watchlist-alerts already
// uses) instead of plain text -- previously the ONLY clickable thing in the
// whole email was the generic "Open the tracker" button, so there was no
// way to tell which specific case (if any) actually drove a click.
function caseListHtml(cases: any[]) {
  if (!cases.length) return `<p style="color:#7c88a8; font-size:13px;">Nothing new to report today.</p>`;
  return cases.map((c) => {
    const caseUrl = c.id
      ? `https://credocket.com/litigation.html?case=${encodeURIComponent(c.id)}&${UTM}`
      : `https://credocket.com/litigation.html?${UTM}`;
    return `
    <div style="padding:14px 0; border-top:1px solid #e2e5eb;">
      <p style="font-size:11px; color:#7c88a8; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 4px;">${c.category || ""}</p>
      <p style="font-weight:600; margin:0 0 6px; font-family:Georgia,serif; font-size:16px;"><a href="${caseUrl}" style="color:inherit; text-decoration:none;">${c.title}</a></p>
      <p style="color:#3d4453; font-size:13.5px; line-height:1.6; margin:0;">${c.summary || ""}</p>
    </div>`;
  }).join("");
}

Deno.serve(async (req) => {
  if (req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10); // ~last day and a half, by date

  const { data: newCases } = await admin.from("case_data").select("*").gte("date", since).order("date", { ascending: false });
  const todaysCases = newCases || [];

  if (!todaysCases.length) {
    return new Response(JSON.stringify({ skipped: "nothing new to send" }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: watchlists } = await admin.from("watchlists").select("*");
  const { data: usersPage } = await admin.auth.admin.listUsers();
  const users = usersPage?.users || [];

  let sent = 0;
  for (const user of users) {
    const myWatchlists = (watchlists || []).filter((w) => w.user_id === user.id);
    const matches = todaysCases.filter((c) => myWatchlists.some((w) => watchlistMatches(w, c)));
    const others = todaysCases.filter((c) => !matches.includes(c)).slice(0, 5);

    const html = `
      <div style="font-family:sans-serif; max-width:560px; margin:0 auto; padding:24px;">
        <p style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#7c88a8;">CREdocket Digest</p>
        <h2 style="font-family:Georgia,serif; margin:8px 0 20px;">Your morning briefing</h2>
        ${matches.length ? `<p style="font-weight:600; font-size:13px; color:#b45309; margin-bottom:4px;">🔥 Matching your watchlists</p>${caseListHtml(matches)}` : ""}
        <p style="font-weight:600; font-size:13px; color:#3355ff; margin:20px 0 4px;">Also tracked today</p>
        ${caseListHtml(others)}
        <p style="margin-top:24px;"><a href="https://credocket.com/litigation.html?${UTM}" style="background:#3355ff; color:#fff; padding:10px 20px; border-radius:999px; text-decoration:none; font-weight:600;">Open the tracker</a></p>
        <p style="font-size:12px; color:#9aa3b5; margin-top:32px;">Manage your watchlists at <a href="https://credocket.com/account.html?${UTM}" style="color:#9aa3b5;">credocket.com/account.html</a>.</p>
      </div>`;

    const ok = await sendEmail(user.email!, `CREdocket: ${todaysCases.length} new matter${todaysCases.length === 1 ? "" : "s"} tracked`, html);
    if (ok) sent++;
  }

  return new Response(JSON.stringify({ usersEmailed: sent, newCasesCount: todaysCases.length }), {
    headers: { "Content-Type": "application/json" }
  });
});
