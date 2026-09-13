/* =========================================================
   CREdocket — Email digest frequency preference (account.html)
   Lets a signed-in user choose daily / weekly / both / none for the two
   scheduled digest emails (supabase/functions/send-morning-digest).
   Stored on Supabase Auth's own user_metadata (auth.updateUser({data})) --
   no new table/migration needed, and send-morning-digest already fetches
   the full user object (including user_metadata) via
   admin.auth.admin.listUsers() for every send, so it reads this directly.
   Deliberately separate from watchlist real-time alerts (a different
   Edge Function, check-and-send-watchlist-alerts) -- this only controls
   the two digest cadences, not those.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const form = document.getElementById("digest-prefs-form");
  const select = document.getElementById("digest-frequency");
  const status = document.getElementById("digest-prefs-status");
  if (!form || !select || !status) return; // not on account.html

  // Mirrors send-morning-digest's own default: a user who has never set
  // this (undefined/legacy) gets both digests, exactly as everyone did
  // before this preference existed -- rolling this out never silently
  // unsubscribes anyone.
  function populateFromSession() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    const pref = session && session.user && session.user.user_metadata && session.user.user_metadata.digest_frequency;
    select.value = ["daily", "weekly", "none"].includes(pref) ? pref : "both";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "Saving…";
    status.className = "auth-modal-status";
    const { error } = await sb.auth.updateUser({ data: { digest_frequency: select.value } });
    if (error) {
      status.textContent = error.message || "Couldn't save — try again.";
      status.className = "auth-modal-status is-error";
      return;
    }
    status.textContent = "Saved.";
    status.className = "auth-modal-status is-success";
    setTimeout(() => { status.textContent = ""; }, 3000);
  });

  sb.auth.getSession().then(populateFromSession);
  sb.auth.onAuthStateChange(populateFromSession);
})();
