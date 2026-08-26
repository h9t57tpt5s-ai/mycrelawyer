/* =========================================================
   CREdocket — Litigation Tools click-through terms gate
   -----------------------------------------------------------
   Blocks the Case Value Calculator and Commercial Eviction
   Handbook until the visitor affirmatively accepts
   litigation-tools-terms.html -- an UNCHECKED checkbox plus a
   separate "I Agree" click, never a pre-checked box or a passive
   "by continuing you agree" banner. Courts have found passive/
   browsewrap-style notice insufficient (Specht v. Netscape) while a
   conspicuous checkbox plus an affirmative click is enforceable
   (Meyer v. Uber Technologies) -- this mirrors that pattern
   deliberately, not incidentally.

   Recorded to localStorage for every visitor (the only record
   possible for anonymous visitors), and additionally written to
   Supabase for signed-in users so there's a real server-side record
   of who accepted which version and when -- a client-side flag alone
   proves nothing in a dispute.
   ========================================================= */

window.RELAW_TERMS_GATE = (function () {
  "use strict";

  // Bump this when the terms change materially -- a version mismatch
  // re-shows the gate even to a visitor who accepted an earlier version.
  const TERMS_VERSION = "1.0";
  const STORAGE_KEY = "credocket_litigation_tools_terms_accepted";

  function hasAccepted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const rec = JSON.parse(raw);
      return !!(rec && rec.version === TERMS_VERSION);
    } catch (e) {
      return false;
    }
  }

  function recordAcceptance(tool) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: TERMS_VERSION, tool: tool, acceptedAt: new Date().toISOString() }));
    } catch (e) {
      // Private browsing / storage blocked -- the gate will just re-show
      // next load, which is the safe failure mode here, not a real error.
    }

    // Best-effort server-side record for signed-in users only -- there's
    // no reliable way to attribute an anonymous visitor's acceptance to
    // anyone, so this simply no-ops when there's no session. A failure
    // here should never block the visitor from continuing -- the
    // localStorage record above already stands regardless.
    try {
      const sb = window.RELAW_SUPABASE;
      if (!sb) return;
      sb.auth.getSession().then(({ data }) => {
        const uid = data && data.session && data.session.user && data.session.user.id;
        if (!uid) return;
        return sb.from("terms_acceptances").insert({ user_id: uid, terms_version: TERMS_VERSION, tool: tool });
      }).then((res) => {
        if (res && res.error) console.error("Failed to log terms acceptance server-side:", res.error);
      }).catch((err) => console.error("Failed to log terms acceptance server-side:", err));
    } catch (e) {
      console.error("Failed to log terms acceptance server-side:", e);
    }
  }

  // Renders the blocking overlay if not yet accepted at the current
  // version, and calls opts.onAccept() once the visitor accepts. If
  // already accepted, calls opts.onAccept() immediately -- callers can
  // unconditionally do `gate(tool, { onAccept: initPage })` and never
  // branch on hasAccepted() themselves.
  function gate(tool, opts) {
    opts = opts || {};
    if (hasAccepted()) {
      if (typeof opts.onAccept === "function") opts.onAccept();
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "terms-gate-overlay";
    overlay.innerHTML = `
      <div class="terms-gate-modal" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
        <div class="eyebrow" style="margin-bottom:10px;">Before You Continue</div>
        <h2 id="terms-gate-title">Litigation Tools Terms, Disclaimer &amp; Waiver</h2>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin:14px 0;">${opts.summary || "This tool produces an AI- and rules-based estimate -- not legal advice, not a prediction, and not a substitute for a licensed attorney. Please review the full terms below before continuing."}</p>
        <div class="terms-gate-scroll">
          <iframe src="litigation-tools-terms.html" title="Litigation Tools Terms, Disclaimer &amp; Waiver"></iframe>
        </div>
        <label class="terms-gate-checkbox">
          <input type="checkbox" id="terms-gate-check" />
          <span>I have read and agree to the <a href="litigation-tools-terms.html" target="_blank" rel="noopener">Litigation Tools Terms, Disclaimer &amp; Waiver</a>, including the binding arbitration and class-action waiver in Section 8.</span>
        </label>
        <div class="terms-gate-actions">
          <a href="index.html" class="btn btn-ghost btn-sm">Decline &amp; Leave</a>
          <button type="button" class="btn btn-primary" id="terms-gate-accept" disabled>I Agree — Continue</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // pointer-events:none on everything but the overlay itself (see
    // terms-gate.css) so the page underneath isn't just visually covered
    // but actually unusable until accepted -- not just a cosmetic dim.
    document.documentElement.classList.add("terms-gate-active");
    document.documentElement.style.overflow = "hidden";

    const checkbox = overlay.querySelector("#terms-gate-check");
    const acceptBtn = overlay.querySelector("#terms-gate-accept");
    checkbox.addEventListener("change", () => { acceptBtn.disabled = !checkbox.checked; });
    acceptBtn.addEventListener("click", () => {
      recordAcceptance(tool);
      document.documentElement.classList.remove("terms-gate-active");
      document.documentElement.style.overflow = "";
      overlay.remove();
      if (typeof opts.onAccept === "function") opts.onAccept();
    });
  }

  return { gate, hasAccepted, TERMS_VERSION };
})();
