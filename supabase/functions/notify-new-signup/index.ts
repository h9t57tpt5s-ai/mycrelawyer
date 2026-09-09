// =========================================================
// CREdocket — New account sign-up notification
//
// Triggered by a Supabase Database Webhook on auth.users INSERT (set up
// in the dashboard, not in code — see the setup steps in this file's own
// comments below). Sends a one-line email via Resend whenever someone
// creates a new free CREdocket account, using the same Resend REST-API
// pattern already proven working for the Settlement Contribution
// Exchange's review notifications (supabase/functions/contribute-
// settlement/index.ts).
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function
//   -> name it exactly "notify-new-signup" -> Code tab -> paste this
//   file's contents -> Deploy.
//
// Secrets needed:
//   RESEND_API_KEY — already configured (same key used by
//     contribute-settlement for its own notifications).
//   SIGNUP_WEBHOOK_SECRET — a new secret YOU make up (any random string,
//     e.g. generate one at https://generate-secret.vercel.app/32) and
//     set on BOTH this function's secrets AND the webhook's custom
//     header (step 3 below). This exists purely so a random person
//     can't hit this endpoint's public URL directly and spam you with
//     fake "new signup" emails — genuinely optional (this function
//     fails OPEN if the secret isn't set, i.e. it still works without
//     it), but cheap to add.
//
// One-time setup after deploying (Supabase Dashboard):
//   1. Database -> Webhooks -> Create a new webhook
//   2. Name: "notify-new-signup", Table: "users", Schema: "auth"
//      (NOT a public-schema table — auth.users specifically)
//   3. Events: check only "Insert"
//   4. Type: "HTTP Request", Method: POST
//      URL: https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/notify-new-signup
//      HTTP Headers (add these two, required for ANY Edge Function call):
//        apikey: <your project's anon/publishable key — same one already
//                 in js/supabase-client.js>
//        Authorization: Bearer <same anon/publishable key>
//      Optional third header (only if you set SIGNUP_WEBHOOK_SECRET above):
//        x-signup-webhook-secret: <the same random string>
//   5. Save. Test it by signing up a throwaway test account and
//      confirming the email arrives.
// =========================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SIGNUP_WEBHOOK_SECRET = Deno.env.get("SIGNUP_WEBHOOK_SECRET") ?? "";
const NOTIFY_EMAIL = "jeffnovel@icloud.com";
const SENDER_EMAIL = "no-reply@credocket.com";

async function sendSignupNotification(email: string, createdAt: string) {
  if (!RESEND_API_KEY) {
    console.error("notify-new-signup: RESEND_API_KEY is not set -- skipping notification email.");
    return;
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `CREdocket <${SENDER_EMAIL}>`,
        to: [NOTIFY_EMAIL],
        subject: `New CREdocket account: ${email}`,
        text: `A new account was created on CREdocket.\n\nEmail: ${email}\nCreated: ${createdAt}`,
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "(could not read response body)");
      console.error(`notify-new-signup: Resend returned ${resp.status} — ${bodyText}`);
    }
  } catch (err) {
    console.error("notify-new-signup: fetch to Resend failed —", String(err));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Optional shared-secret check -- fails OPEN (proceeds anyway) if
  // SIGNUP_WEBHOOK_SECRET was never configured, since the worst outcome
  // of skipping it is an occasional spurious email, not a data leak.
  if (SIGNUP_WEBHOOK_SECRET) {
    const provided = req.headers.get("x-signup-webhook-secret") ?? "";
    if (provided !== SIGNUP_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Invalid webhook secret" }), { status: 401 });
    }
  }

  let payload: { type?: string; table?: string; schema?: string; record?: { email?: string; created_at?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }

  // Supabase's Database Webhook payload shape for an INSERT on auth.users:
  // { type: "INSERT", table: "users", schema: "auth", record: {...new row...}, old_record: null }
  const email = payload.record?.email;
  const createdAt = payload.record?.created_at || new Date().toISOString();
  if (!email) {
    console.error("notify-new-signup: no email found on payload.record — payload was:", JSON.stringify(payload));
    return new Response(JSON.stringify({ ok: false, error: "No email in payload" }), { status: 200 });
  }

  await sendSignupNotification(email, createdAt);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
