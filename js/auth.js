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
  const PENDING_CASE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — magic links can be clicked from a different tab/device
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

  function setPendingCase(caseId) {
    // localStorage (not sessionStorage) because the magic-link email is
    // almost always opened in a new tab, sometimes even a new window —
    // sessionStorage wouldn't survive that jump.
    localStorage.setItem(PENDING_CASE_KEY, JSON.stringify({ caseId, savedAt: Date.now() }));
  }

  function resumePendingCaseIfAny() {
    if (!currentSession) return;
    const raw = localStorage.getItem(PENDING_CASE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_CASE_KEY);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    if (!parsed || !parsed.caseId) return;
    if (Date.now() - parsed.savedAt > PENDING_CASE_MAX_AGE_MS) return;
    if (window.RELAW_UTILS && window.RELAW_UTILS.openCaseDetail) {
      window.RELAW_UTILS.openCaseDetail(parsed.caseId);
    }
  }

  /* ---------- Nav auth widget ---------- */
  // Registered once at module load, not inside renderNavWidget() -- that
  // function re-runs on every auth-state change (sign in, sign out, token
  // refresh), and re-attaching a document-level listener each time would
  // stack up duplicates for the life of the page. Queries the dropdown/
  // button fresh on every click instead of closing over stale references
  // from whichever render happened to be active when it was attached.
  document.addEventListener("click", (e) => {
    const slot = document.getElementById("auth-nav-slot");
    const dropdown = document.getElementById("auth-nav-dropdown");
    if (!slot || !dropdown || !dropdown.classList.contains("open")) return;
    if (slot.contains(e.target)) return;
    dropdown.classList.remove("open");
    const btn = document.getElementById("auth-account-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  });

  function renderNavWidget() {
    const slot = document.getElementById("auth-nav-slot");
    if (!slot) return;
    if (currentSession && currentSession.user) {
      const email = currentSession.user.email || "";
      const initial = email.charAt(0) || "?";
      // A compact avatar button + click-to-reveal dropdown, not the full
      // raw email shown inline at all times -- that used to cost ~150-
      // 200px of nav width on every page, which could genuinely overflow
      // the viewport on a page with its own nav CTA (litigation.html's
      // "Talk to us") in the narrow-desktop range just above the mobile
      // breakpoint. See the CSS comment on .auth-nav-account for the
      // measured overflow this replaced.
      slot.innerHTML = `
        <div class="auth-nav-account">
          <button type="button" class="auth-nav-avatar-btn" id="auth-account-btn" aria-haspopup="true" aria-expanded="false" title="${email}">${initial}</button>
          <div class="auth-nav-dropdown" id="auth-nav-dropdown" role="menu">
            <div class="auth-nav-dropdown-email">${email}</div>
            <button type="button" class="auth-nav-signout" id="auth-signout-btn">Sign out</button>
          </div>
        </div>`;
      const accountBtn = document.getElementById("auth-account-btn");
      const dropdown = document.getElementById("auth-nav-dropdown");
      accountBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !dropdown.classList.contains("open");
        dropdown.classList.toggle("open", willOpen);
        accountBtn.setAttribute("aria-expanded", String(willOpen));
      });
      document.getElementById("auth-signout-btn").addEventListener("click", () => {
        sb.auth.signOut();
      });
    } else {
      slot.innerHTML = `<button type="button" class="auth-nav-signin" id="auth-signin-btn">Sign in</button>`;
      document.getElementById("auth-signin-btn").addEventListener("click", () => openSignInModal());
    }
  }

  /* ---------- Sign-in modal (password, with email-link as a fallback) ----
     Sessions persist across visits by default (see js/supabase-client.js)
     -- signing in once keeps a visitor signed in on return visits until
     they explicitly sign out, regardless of which method they use here. */
  let modalEl = null;
  let passwordMode = "signin"; // "signin" | "signup"

  function setPasswordMode(mode) {
    passwordMode = mode;
    const submitBtn = modalEl.querySelector("#auth-password-submit");
    const modeLabel = modalEl.querySelector("#auth-password-mode-label");
    const modeToggle = modalEl.querySelector("#auth-password-mode-toggle");
    const passwordInput = modalEl.querySelector("#auth-password-password");
    const forgotRow = modalEl.querySelector("#auth-forgot-row");
    if (mode === "signup") {
      submitBtn.textContent = "Create account";
      modeLabel.textContent = "Already have a password?";
      modeToggle.textContent = "Sign in instead";
      passwordInput.setAttribute("autocomplete", "new-password");
      passwordInput.setAttribute("minlength", "8");
      forgotRow.style.display = "none";
    } else {
      submitBtn.textContent = "Sign in";
      modeLabel.textContent = "Don't have a password yet?";
      modeToggle.textContent = "Create one";
      passwordInput.setAttribute("autocomplete", "current-password");
      passwordInput.removeAttribute("minlength");
      forgotRow.style.display = "";
    }
    modalEl.querySelector("#auth-password-status").textContent = "";
  }

  function setActiveTab(tab) {
    modalEl.querySelectorAll(".auth-modal-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    modalEl.querySelectorAll(".auth-modal-panel").forEach((panel) => {
      panel.style.display = panel.getAttribute("data-panel") === tab ? "" : "none";
    });
  }

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
        <div class="auth-modal-tabs">
          <button type="button" class="auth-modal-tab active" data-tab="password">Email &amp; password</button>
          <button type="button" class="auth-modal-tab" data-tab="link">Email link</button>
        </div>

        <div class="auth-modal-panel" data-panel="password">
          <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin: 14px 0 18px;">You'll stay signed in on this device — no need to log in again next time you visit.</p>
          <form id="auth-password-form">
            <input type="email" id="auth-password-email" class="auth-modal-input" placeholder="you@yourfirm.com" required autocomplete="email" />
            <input type="password" id="auth-password-password" class="auth-modal-input" placeholder="Password" required autocomplete="current-password" style="margin-top:10px;" />
            <button type="submit" class="btn btn-primary btn-sm" id="auth-password-submit" style="width:100%; justify-content:center; margin-top:12px;">Sign in</button>
          </form>
          <p class="auth-modal-switch"><span id="auth-password-mode-label">Don't have a password yet?</span> <button type="button" id="auth-password-mode-toggle" class="auth-modal-link">Create one</button></p>
          <p class="auth-modal-switch" id="auth-forgot-row"><button type="button" id="auth-forgot-btn" class="auth-modal-link">Forgot password?</button></p>
          <div id="auth-password-status" class="auth-modal-status"></div>
        </div>

        <div class="auth-modal-panel" data-panel="link" style="display:none;">
          <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin: 14px 0 18px;">No password needed — we'll email you a one-time sign-in link instead.</p>
          <form id="auth-modal-form">
            <input type="email" id="auth-modal-email" class="auth-modal-input" placeholder="you@yourfirm.com" required autocomplete="email" />
            <button type="submit" class="btn btn-primary btn-sm" style="width:100%; justify-content:center; margin-top:12px;">Send sign-in link</button>
          </form>
          <div id="auth-modal-status" class="auth-modal-status"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    modalEl.addEventListener("click", (e) => { if (e.target === modalEl) closeSignInModal(); });
    modalEl.querySelector(".auth-modal-close").addEventListener("click", closeSignInModal);

    modalEl.querySelectorAll(".auth-modal-tab").forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.getAttribute("data-tab")));
    });

    modalEl.querySelector("#auth-password-mode-toggle").addEventListener("click", () => {
      setPasswordMode(passwordMode === "signin" ? "signup" : "signin");
    });

    modalEl.querySelector("#auth-password-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = modalEl.querySelector("#auth-password-email").value.trim();
      const password = modalEl.querySelector("#auth-password-password").value;
      const statusEl = modalEl.querySelector("#auth-password-status");
      if (!email || !password) return;
      if (passwordMode === "signup" && password.length < 8) {
        statusEl.textContent = "Password must be at least 8 characters.";
        statusEl.className = "auth-modal-status is-error";
        return;
      }
      statusEl.textContent = passwordMode === "signup" ? "Creating your account…" : "Signing in…";
      statusEl.className = "auth-modal-status";

      if (passwordMode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.href }
        });
        if (error) {
          statusEl.textContent = error.message || "Something went wrong — try again.";
          statusEl.className = "auth-modal-status is-error";
        } else if (data.session) {
          statusEl.textContent = "Account created — you're signed in.";
          statusEl.className = "auth-modal-status is-success";
          setTimeout(closeSignInModal, 700);
        } else {
          statusEl.textContent = `Check ${email} to confirm your account, then come back and sign in.`;
          statusEl.className = "auth-modal-status is-success";
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          statusEl.textContent = error.message || "Incorrect email or password.";
          statusEl.className = "auth-modal-status is-error";
        } else {
          statusEl.textContent = "Signed in.";
          statusEl.className = "auth-modal-status is-success";
          setTimeout(closeSignInModal, 500);
        }
      }
    });

    modalEl.querySelector("#auth-forgot-btn").addEventListener("click", async () => {
      const email = modalEl.querySelector("#auth-password-email").value.trim();
      const statusEl = modalEl.querySelector("#auth-password-status");
      if (!email) {
        statusEl.textContent = "Enter your email above first, then click Forgot password?";
        statusEl.className = "auth-modal-status is-error";
        return;
      }
      statusEl.textContent = "Sending a reset link…";
      statusEl.className = "auth-modal-status";
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password.html"
      });
      if (error) {
        statusEl.textContent = error.message || "Something went wrong — try again.";
        statusEl.className = "auth-modal-status is-error";
      } else {
        statusEl.textContent = `Check ${email} for a password reset link.`;
        statusEl.className = "auth-modal-status is-success";
      }
    });

    modalEl.querySelector("#auth-modal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = modalEl.querySelector("#auth-modal-email");
      const statusEl = modalEl.querySelector(".auth-modal-panel[data-panel='link'] .auth-modal-status");
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
    if (pendingCaseId) setPendingCase(pendingCaseId);
    const m = buildModal();
    setActiveTab("password");
    setPasswordMode("signin");
    m.querySelector("#auth-password-password").value = "";
    m.querySelector("#auth-password-status").textContent = "";
    m.querySelectorAll(".auth-modal-panel[data-panel='link'] .auth-modal-status").forEach((el) => (el.textContent = ""));
    m.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => m.querySelector("#auth-password-email").focus(), 50);
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
