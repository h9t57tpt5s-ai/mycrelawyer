// Supabase Edge Function: send-morning-digest
//
// The "start your day here" product (item 11). Runs on a schedule (set up
// via pg_cron — the live cron job itself lives in the Supabase database,
// not this repo; see the deploy note at the bottom of this file for the
// weekly variant's own schedule) — no external caller needed day to day,
// though it's still protected by the same shared secret for safety.
//
// Sends every registered user a summary of matters/trends added in roughly
// the last day. If a user has watchlists, matches against those are called
// out first; everyone also gets the day's top new items generally, so this
// is useful even for accounts with no watchlist yet.
//
// WEEKLY VARIANT (medium-effort item 4, ~80% shared infrastructure with the
// daily job per the distribution-strategy review): the SAME function now
// also serves a "forward to your team" weekly cadence, selected by an
// optional `period` field in the POST body (`{"period":"weekly"}`) --
// defaults to "daily" when the body is empty/missing/invalid, so the
// EXISTING daily pg_cron job (which sends no body) keeps working exactly
// as it always has, unmodified. A weekly send widens the lookback window
// to ~8 days, changes the subject/framing to something a recipient would
// actually forward to a colleague, and raises the "also tracked" cap
// (a week has more items worth a mention than a day does). This is a
// separate pg_cron job pointed at the same function URL with that body --
// see the SQL note at the bottom.
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

type Period = "daily" | "weekly";

// Everything that differs between the two cadences, in one place --
// widening the window and reframing the copy is the entire diff between
// "morning digest" and "weekly, forward-to-your-team digest." windowHours
// keeps the same ~1.5x buffer-over-nominal-period ratio the original daily
// job used (36h over a 24h day) so a cron firing a little early/late never
// silently produces an empty send.
const PERIOD_CONFIG: Record<Period, {
  windowHours: number;
  campaign: string; // own UTM campaign per cadence, same convention as check-and-send-watchlist-alerts vs. this function -- so the two are told apart in analytics
  headerEyebrow: string;
  headerTitle: string;
  othersLabel: string;
  othersCap: number;
  shareLine: string | null;
  subjectPrefix: string;
  periodNoun: string; // used in the subject line and the "others" section, e.g. "today" / "this week"
}> = {
  daily: {
    windowHours: 36,
    campaign: "morning-digest",
    headerEyebrow: "CREdocket Digest",
    headerTitle: "Your morning briefing",
    othersLabel: "Also tracked today",
    othersCap: 5,
    shareLine: null,
    subjectPrefix: "CREdocket",
    periodNoun: "today",
  },
  weekly: {
    windowHours: 8 * 24,
    campaign: "weekly-digest",
    headerEyebrow: "CREdocket Weekly Digest",
    headerTitle: "Your weekly briefing",
    othersLabel: "Also tracked this week",
    othersCap: 12,
    shareLine: "Know someone on your team who should see this? Forward this email, or send them straight to the tracker below.",
    subjectPrefix: "CREdocket Weekly",
    periodNoun: "this week",
  },
};

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
function caseListHtml(cases: any[], utm: string) {
  if (!cases.length) return `<p style="color:#7c88a8; font-size:13px;">Nothing new to report.</p>`;
  return cases.map((c) => {
    const caseUrl = c.id
      ? `https://credocket.com/litigation.html?case=${encodeURIComponent(c.id)}&${utm}`
      : `https://credocket.com/litigation.html?${utm}`;
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

  // Defensive: the existing daily pg_cron job sends no body at all (or an
  // empty one) -- req.json() throwing on that is expected, not an error,
  // and must still resolve to the daily cadence exactly as before.
  let period: Period = "daily";
  try {
    const body = await req.json();
    if (body && body.period === "weekly") period = "weekly";
  } catch {
    // no body / invalid JSON -- stay on the daily default
  }
  const cfg = PERIOD_CONFIG[period];
  const UTM = `utm_source=credocket&utm_medium=email&utm_campaign=${cfg.campaign}`;

  const since = new Date(Date.now() - cfg.windowHours * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: newCases } = await admin.from("case_data").select("*").gte("date", since).order("date", { ascending: false });
  const todaysCases = newCases || [];

  if (!todaysCases.length) {
    return new Response(JSON.stringify({ skipped: "nothing new to send", period }), { headers: { "Content-Type": "application/json" } });
  }

  const { data: watchlists } = await admin.from("watchlists").select("*");
  const { data: usersPage } = await admin.auth.admin.listUsers();
  const users = usersPage?.users || [];

  let sent = 0;
  for (const user of users) {
    const myWatchlists = (watchlists || []).filter((w) => w.user_id === user.id);
    const matches = todaysCases.filter((c) => myWatchlists.some((w) => watchlistMatches(w, c)));
    const others = todaysCases.filter((c) => !matches.includes(c)).slice(0, cfg.othersCap);

    const html = `
      <div style="font-family:sans-serif; max-width:560px; margin:0 auto; padding:24px;">
        <p style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#7c88a8;">${cfg.headerEyebrow}</p>
        <h2 style="font-family:Georgia,serif; margin:8px 0 20px;">${cfg.headerTitle}</h2>
        ${matches.length ? `<p style="font-weight:600; font-size:13px; color:#b45309; margin-bottom:4px;">🔥 Matching your watchlists</p>${caseListHtml(matches, UTM)}` : ""}
        <p style="font-weight:600; font-size:13px; color:#3355ff; margin:20px 0 4px;">${cfg.othersLabel}</p>
        ${caseListHtml(others, UTM)}
        <p style="margin-top:24px;"><a href="https://credocket.com/litigation.html?${UTM}" style="background:#3355ff; color:#fff; padding:10px 20px; border-radius:999px; text-decoration:none; font-weight:600;">Open the tracker</a></p>
        ${cfg.shareLine ? `<p style="font-size:13px; color:#3d4453; line-height:1.6; margin-top:20px; padding-top:16px; border-top:1px solid #e2e5eb;">${cfg.shareLine}</p>` : ""}
        <p style="font-size:12px; color:#9aa3b5; margin-top:32px;">Manage your watchlists at <a href="https://credocket.com/account.html?${UTM}" style="color:#9aa3b5;">credocket.com/account.html</a>.</p>
      </div>`;

    const ok = await sendEmail(
      user.email!,
      `${cfg.subjectPrefix}: ${todaysCases.length} new matter${todaysCases.length === 1 ? "" : "s"} ${cfg.periodNoun}`,
      html
    );
    if (ok) sent++;
  }

  return new Response(JSON.stringify({ usersEmailed: sent, newCasesCount: todaysCases.length, period }), {
    headers: { "Content-Type": "application/json" }
  });
});

// ---------------------------------------------------------------------
// DEPLOY NOTE — adding the weekly cadence's own pg_cron job:
//
// The existing daily job (name: "morning-digest", 0 12 * * * UTC) keeps
// firing exactly as before and needs no changes. To add the weekly send
// (this example: Monday 12:00 UTC / 7am Central), run in the Supabase
// SQL editor once this function is redeployed:
//
//   select cron.schedule(
//     'weekly-digest',
//     '0 12 * * 1',
//     $$
//     select net.http_post(
//       url := '<this function's URL, same one morning-digest already uses>',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'x-automation-secret', '<the same AUTOMATION_SECRET value>'
//       ),
//       body := jsonb_build_object('period', 'weekly')
//     );
//     $$
//   );
//
// Find the existing "morning-digest" job's exact url/headers first with
// `select * from cron.job where jobname = 'morning-digest';` and copy its
// url/secret rather than retyping them, to guarantee they match.
// ---------------------------------------------------------------------
