/* =========================================================
   CREdocket — Commercial Eviction Handbook page logic
   Texas renders straight from the public EVICTION_GUIDE_DATA (free
   sample). Every other state is fetched from Supabase
   (eviction_guide_chapters) at click time — row-level security only
   returns a row to an account with a matching handbook_purchases
   row, so an unauthorized fetch just comes back empty rather than
   ever shipping the gated text to the browser.
   ========================================================= */

(function () {
  "use strict";
  if (typeof EVICTION_GUIDE_DATA === "undefined") return;

  // ---- CONFIG: fill these in once set up ----------------------------
  // 1. Create a fixed-price Stripe Payment Link for the full handbook
  //    and paste its URL here (Stripe Dashboard → Payment Links).
  //    Ask buyers to check out with the SAME email as their CREdocket
  //    account, since purchases are matched by account, not email alone.
  const STRIPE_PAYMENT_LINK_URL = "https://buy.stripe.com/aFacMX20u8GKeLJetz1B600";
  const PRICE_DISPLAY = "$195";
  // ---------------------------------------------------------------------

  const sb = window.RELAW_SUPABASE;
  const PENDING_STATE_KEY = "credocket_pending_eg_state";
  const PENDING_STATE_MAX_AGE_MS = 30 * 60 * 1000;

  function el(sel) { return document.querySelector(sel); }

  function classificationColor(c) {
    if (c === "Landlord-Friendly") return "#16a34a";
    if (c === "Tenant-Friendly") return "#dc2626";
    return "#64748b";
  }

  function badgeHtml(classification) {
    const color = classificationColor(classification);
    return `<span class="badge eg-classification-badge" style="background:color-mix(in srgb, ${color} 16%, transparent); color:${color}; border:1px solid color-mix(in srgb, ${color} 35%, transparent);"><span class="badge-dot" style="background:${color}"></span>${classification}</span>`;
  }

  function lockIconHtml(unlocked) {
    return unlocked
      ? `<svg class="eg-lock-icon" viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M7 11V8a5 5 0 0 1 9.5-2.2M6 11h12v9H6z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="eg-lock-icon" viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="6" y="11" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  }

  function sectionHtml(sec) {
    const extraClass = sec.key === "draftingConsiderations" ? " is-drafting" : sec.key === "sourceNotes" ? " is-source" : "";
    let bodyHtml;
    if (sec.key === "draftingConsiderations") {
      const items = sec.content.split("\n").map((l) => l.trim()).filter(Boolean);
      bodyHtml = `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    } else {
      bodyHtml = `<p>${sec.content}</p>`;
    }
    return `<div class="eg-chapter-section${extraClass}"><h3>${sec.label}</h3>${bodyHtml}</div>`;
  }

  function chapterContentHtml(blurb, sections) {
    return (blurb ? `<div class="eg-chapter-blurb">${blurb}</div>` : "") + sections.map(sectionHtml).join("");
  }

  /* ---------- Static text (title/subtitle/scope/disclaimer) ---------- */
  function renderMeta() {
    const d = EVICTION_GUIDE_DATA;
    if (el("#eg-title")) el("#eg-title").textContent = d.meta.title;
    if (el("#eg-subtitle")) el("#eg-subtitle").textContent = d.subtitle || d.meta.subtitle;
    if (el("#eg-edition")) el("#eg-edition").textContent = `${d.meta.edition} — ${d.meta.publisher}`;
    if (el("#eg-scope")) el("#eg-scope").textContent = d.scope;
    if (el("#eg-disclaimer")) el("#eg-disclaimer").textContent = d.disclaimer;
    if (el("#eg-revision-basis")) el("#eg-revision-basis").textContent = d.revisionBasis;
  }

  /* ---------- Texas free sample ---------- */
  function renderTexas() {
    const tx = EVICTION_GUIDE_DATA.texasFull;
    const meta = EVICTION_GUIDE_DATA.states.find((s) => s.slug === EVICTION_GUIDE_DATA.freeStateSlug);
    if (el("#eg-texas-badge") && meta) el("#eg-texas-badge").outerHTML = badgeHtml(meta.classification);
    if (el("#eg-texas-chapter")) el("#eg-texas-chapter").innerHTML = chapterContentHtml(tx.blurb, tx.sections);
  }

  /* ---------- Locked state grid ---------- */
  function renderGrid() {
    const grid = el("#eg-state-grid");
    if (!grid) return;
    const others = EVICTION_GUIDE_DATA.states.filter((s) => s.slug !== EVICTION_GUIDE_DATA.freeStateSlug);
    grid.innerHTML = others
      .map(
        (s) => `
      <button type="button" class="eg-state-card" data-slug="${s.slug}">
        <div>
          <div class="eg-state-card-name">${s.name}</div>
          <div class="eg-state-card-meta">
            <span class="eg-state-card-class" style="color:${classificationColor(s.classification)};">${s.classification}</span>
          </div>
        </div>
        ${lockIconHtml(false)}
      </button>`
      )
      .join("");
    grid.querySelectorAll(".eg-state-card").forEach((card) => {
      card.addEventListener("click", () => openStatePanel(card.getAttribute("data-slug")));
    });
  }

  /* ---------- Detail panel (built once, reused) ---------- */
  let overlay, panel;
  function buildPanel() {
    if (panel) return;
    // Distinct classes from js/main.js's own case-detail panel (also present
    // on this page via js/data.js) — both use "overlay"/"detail-panel" for
    // shared styling, so this one needs its own hook to select reliably.
    overlay = document.createElement("div");
    overlay.className = "overlay eg-overlay";
    panel = document.createElement("div");
    panel.className = "detail-panel eg-detail-panel";
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    function close() {
      overlay.classList.remove("open");
      panel.classList.remove("open");
      document.body.style.overflow = "";
    }
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    panel._close = close;
  }

  function setPendingState(slug) {
    localStorage.setItem(PENDING_STATE_KEY, JSON.stringify({ slug, savedAt: Date.now() }));
  }
  function resumePendingStateIfAny() {
    if (!window.RELAW_AUTH || !window.RELAW_AUTH.getSession()) return;
    const raw = localStorage.getItem(PENDING_STATE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_STATE_KEY);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    if (!parsed || !parsed.slug || Date.now() - parsed.savedAt > PENDING_STATE_MAX_AGE_MS) return;
    openStatePanel(parsed.slug);
  }

  function purchaseCardHtml(stateName) {
    const buyBtn = STRIPE_PAYMENT_LINK_URL
      ? `<a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Unlock the Full Handbook</a>`
      : `<a href="contact.html?matter=${encodeURIComponent("Commercial Eviction Handbook — full 50-state access")}" class="btn btn-primary btn-sm">Contact Us to Purchase</a>`;
    return `
      <div class="gate-card eg-purchase-card">
        <div class="eyebrow" style="margin-bottom:8px;">Full Handbook Required</div>
        <h3 style="margin-bottom:4px;">Unlock ${stateName} and all 50 states</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY} <small>one-time</small></div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:18px;">Every jurisdiction, verified against primary sources — checkout with the same email as your CREdocket account so access unlocks automatically after purchase.</p>
        ${buyBtn}
      </div>`;
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to unlock this chapter</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">The Texas chapter is free for everyone — every other state requires a free account and the full handbook purchase.</p>
        <button type="button" class="btn btn-primary btn-sm" id="eg-signin-btn">Sign in to continue</button>
      </div>`;
  }

  async function openStatePanel(slug) {
    buildPanel();
    const meta = EVICTION_GUIDE_DATA.states.find((s) => s.slug === slug);
    if (!meta) return;

    panel.innerHTML = `
      <div class="top-row">
        <span class="badge badge-live">Chapter ${meta.chapter}</span>
        <button class="detail-close" aria-label="Close" id="eg-close-btn">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <h2>${meta.name}</h2>
      ${badgeHtml(meta.classification)}
      <div class="rule mt-24" style="margin-bottom:24px;"></div>
      <div id="eg-panel-content"><div class="gate-card is-loading">Checking access…</div></div>
    `;
    document.getElementById("eg-close-btn").addEventListener("click", panel._close);
    overlay.classList.add("open");
    panel.classList.add("open");
    document.body.style.overflow = "hidden";

    const contentSlot = document.getElementById("eg-panel-content");
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();

    if (!window.RELAW_AUTH || !sb) {
      contentSlot.innerHTML = purchaseCardHtml(meta.name);
      return;
    }
    if (!session) {
      contentSlot.innerHTML = signInCardHtml();
      document.getElementById("eg-signin-btn").addEventListener("click", () => {
        setPendingState(slug);
        window.RELAW_AUTH.openSignInModal();
      });
      return;
    }

    try {
      const { data, error } = await sb
        .from("eviction_guide_chapters")
        .select("blurb, sections")
        .eq("slug", slug)
        .maybeSingle();
      if (!panel.classList.contains("open")) return; // panel moved on
      if (error) throw error;
      if (data) {
        contentSlot.innerHTML = chapterContentHtml(data.blurb, data.sections);
      } else {
        contentSlot.innerHTML = purchaseCardHtml(meta.name);
      }
    } catch (err) {
      contentSlot.innerHTML = `<div class="gate-card"><div class="eyebrow" style="margin-bottom:8px;">Something went wrong</div><p class="text-secondary" style="font-size:13.5px;">${(err && err.message) || "Couldn't check access — try reopening this chapter."}</p></div>`;
    }
  }

  renderMeta();
  renderTexas();
  renderGrid();

  // Resume an intended state after a sign-in redirect, same pattern as
  // the case-detail pending flow in auth.js but scoped to this page.
  if (sb) {
    sb.auth.onAuthStateChange(() => resumePendingStateIfAny());
    setTimeout(resumePendingStateIfAny, 400);
  }
})();
