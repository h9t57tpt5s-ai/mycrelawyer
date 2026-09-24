/* =========================================================
   CREdocket — Slack delivery for portfolio filing alerts (account.html)
   The user pastes a Slack incoming-webhook URL. It is stored on their own
   Supabase Auth user_metadata (no table, no migration), and the
   ingest-court-filings Edge Function posts each alert there alongside the
   email. The server accepts only https://hooks.slack.com/services/...
   addresses; the same check runs here so a typo fails before saving.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const form = document.getElementById("slack-alerts-form");
  const input = document.getElementById("slack-webhook");
  const removeBtn = document.getElementById("slack-remove");
  const status = document.getElementById("slack-status");
  if (!form || !input || !status) return; // not on account.html

  const VALID = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/;

  function show(msg, kind) {
    status.textContent = msg;
    status.className = "auth-modal-status" + (kind ? " is-" + kind : "");
  }

  function populateFromSession() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    const url = session && session.user && session.user.user_metadata && session.user.user_metadata.alert_slack_webhook;
    input.value = typeof url === "string" ? url : "";
    if (removeBtn) removeBtn.style.display = input.value ? "" : "none";
  }

  async function save(value) {
    show("Saving…");
    const { error } = await sb.auth.updateUser({ data: { alert_slack_webhook: value } });
    if (error) {
      show(error.message || "Couldn't save — try again.", "error");
      return false;
    }
    if (removeBtn) removeBtn.style.display = value ? "" : "none";
    return true;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!VALID.test(url) || url.length > 300) {
      show("That isn't a Slack incoming-webhook address. It should start with https://hooks.slack.com/services/", "error");
      return;
    }
    if (await save(url)) show("Connected. New alerts will post to that Slack channel as well as email.", "success");
  });

  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      if (await save(null)) {
        input.value = "";
        show("Slack disconnected. Alerts will arrive by email only.", "success");
      }
    });
  }

  sb.auth.getSession().then(populateFromSession);
  sb.auth.onAuthStateChange(populateFromSession);
})();
