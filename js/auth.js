/* =========================================================
   CREdocket — Account auth + metered paywall
   - Free to browse: all case titles, summaries, "why it matters",
     filters, Market Signals, Regulatory Tracker.
   - Requires a free account: reading a case's full write-up
     (Case Timeline + Full Article). First 3 distinct matters read
     per calendar month are free per account; the 4th+ is gated
     until the monthly reset (paid tier not live yet).
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const PENDING_CASE_KEY = "credocket_pending_case";
  let currentSession = null;

  /* ---------- Session bootstrap ---------- */
  sb.auth.getSession().then(({ data }) => {
    currentSession = data.session || null;
    renderNavWidget();
    resumePendingCaseIfAny();
  });

  sb.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    renderNavWidget();
    resumePendingCaseIfAny();
  });

  function resumePendingCaseIfAny() {
    if (!currentSession) return;
    const pending = sessionStorage.getItem(PENDING_CASE_KEY);
    if (pending && window.RELAW_UTILS && window.RELAW_UTILS.openCaseDetail) {
      sessionStorage.removeItem(PENDING_CASE_KEY);
      window.RELAW_UTILS.openCaseDetail(pending);
    }
  }

  /* ---------- Nav auth widget ---------- */
  function renderNavWidget() {
    const slot = document.getElementById("auth-nav-slot");
    if (!slot) return;
    if (currentSession && currentSession.user) {
      const email = currentSession.user.email || "";
      slot.innerHTML = `
        <div class="auth-nav-account">
          <span class="auth-nav-email" title="${email}">${email}</span>
          <button type="button" class="auth-nav-signout" id="auth-signout-btn">Sign out</button>
        </div>`;
      document.getElementById("auth-signout-btn").addEventListener("click", () => {
        sb.auth.signOut();
      });
    } else {
      slot.innerHTML = `<button type="button" class="auth-nav-signin" id="auth-signin-btn">Sign in</button>`;
      document.getElementById("auth-signin-btn").addEventListener("click", () => openSignInModal());
    }
  }

  /* ---------- Sign-in modal (magic link) ---------- */
  let modalEl = null;
  function buildModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.className = "auth-modal-overlay";
    modalEl.innerHTML = `
      <div class="auth-modal" role="dialog" aria-label="Sign in">
        <button type="button" class="auth-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <div class="eyebrow" style="margin-bottom:10px;">Free account</div>
        <h3 style="margin-bottom:8px;">Sign in to keep reading</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:20px;">No password needed — we'll email you a one-time sign-in link. Free accounts get 3 full write-ups a month, no card required.</p>
        <form id="auth-modal-form">
          <input type="email" id="auth-modal-email" placeholder="you@yourfirm.com" required autocomplete="email" />
          <button type="submit" class="btn btn-primary btn-sm" style="width:100%; justify-content:center; margin-top:12px;">Send sign-in link</button>
        </form>
        <div id="auth-modal-status" class="auth-modal-status"></div>
      </div>`;
    document.body.appendChild(modalEl);
    modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeSignInModal(); });
    modalEl.querySelector(".auth-modal-close").addEventListener("click", closeSignInModal);
    modalEl.querySelector("#auth-modal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = modalEl.querySelector("#auth-modal-email");
      const statusEl = modalEl.querySelector("#auth-modal-status");
      const email = emailInput.value.trim();
      if (!email) return;
      statusEl.textContent = "Sending…";
      statusEl.className = "auth-modal-status";
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href }
      });
      if (error) {
        statusEl.textContent = error.message || "Something went wrong — try again.";
        statusEl.className = "auth-modal-status is-error";
      } else {
        statusEl.textContent = `Check ${email} for a sign-in link. You can close this and come back after you click it.`;
        statusEl.className = "auth-modal-status is-success";
      }
    });
    return modalEl;
  }

  function openSignInModal(pendingCaseId) {
    if (pendingCaseId) sessionStorage.setItem(PENDING_CASE_KEY, pendingCaseId);
    const m = buildModal();
    m.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => m.querySelector("#auth-modal-email").focus(), 50);
  }
  function closeSignInModal() {
    if (!modalEl) return;
    modalEl.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------- Paywall gate ---------- */
  const MONTHLY_LIMIT = 3;
  // Temporarily off: signed-in users get unlimited reads while we're still
  // getting the account flow dialed in. View records still get written below
  // (untouched), so flipping this back to true re-enables the real limit
  // retroactively against whatever history has already accumulated.
  const ENFORCE_MONTHLY_LIMIT = false;

  function startOfMonthIso() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  function nextResetLabel() {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return next.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  // Returns a promise resolving to one of:
  //   { status: "not-logged-in" }
  //   { status: "ok" }                                  (already read, or a fresh read just recorded)
  //   { status: "limit-reached", resetLabel, limit }
  //   { status: "error", message }
  async function checkGate(caseId) {
    if (!currentSession || !currentSession.user) {
      return { status: "not-logged-in" };
    }
    const userId = currentSession.user.id;
    try {
      const { data: existing, error: existingErr } = await sb
        .from("case_views")
        .select("id")
        .eq("user_id", userId)
        .eq("case_id", caseId)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) return { status: "ok" };

      const { count, error: countErr } = await sb
        .from("case_views")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("viewed_at", startOfMonthIso());
      if (countErr) throw countErr;

      if (ENFORCE_MONTHLY_LIMIT && (count || 0) >= MONTHLY_LIMIT) {
        return { status: "limit-reached", resetLabel: nextResetLabel(), limit: MONTHLY_LIMIT };
      }

      const { error: insertErr } = await sb
        .from("case_views")
        .insert({ user_id: userId, case_id: caseId });
      if (insertErr) throw insertErr;

      return { status: "ok" };
    } catch (err) {
      return { status: "error", message: (err && err.message) || "Couldn't check access — try again." };
    }
  }

  window.RELAW_AUTH = {
    getSession: () => currentSession,
    openSignInModal,
    checkGate,
    MONTHLY_LIMIT,
    ENFORCE_MONTHLY_LIMIT
  };
})();
