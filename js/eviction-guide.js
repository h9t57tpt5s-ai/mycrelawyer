/* =========================================================
   CREdocket — Commercial Eviction Handbook page logic
   Free for everyone, no purchase or sign-in required (matches
   premises-liability-guide.js's model). Texas renders straight from
   the public EVICTION_GUIDE_DATA; every other state is fetched from
   Supabase (eviction_guide_chapters) at click time — its RLS policy
   grants SELECT to anon + authenticated unconditionally (see
   handbook_project/schema_eviction_guide_make_free.sql), so this is
   just a lazy-load, not an access check. To restore the paywall,
   revert that policy and this file to their prior git history.
   ========================================================= */

(function () {
  "use strict";
  if (typeof EVICTION_GUIDE_DATA === "undefined") return;

  const sb = window.RELAW_SUPABASE;

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

  /* ---------- Author byline (single source of truth: RELAW_DATA.author
     in js/data.js, rendered via the shared helper in js/main.js) ---------- */
  function renderByline() {
    const host = el("#eg-byline-host");
    if (host && window.RELAW_UTILS && window.RELAW_UTILS.bylineHtml) {
      host.innerHTML = window.RELAW_UTILS.bylineHtml();
    }
  }

  /* ---------- Texas featured chapter ---------- */
  function renderTexas() {
    const tx = EVICTION_GUIDE_DATA.texasFull;
    const meta = EVICTION_GUIDE_DATA.states.find((s) => s.slug === EVICTION_GUIDE_DATA.freeStateSlug);
    if (el("#eg-texas-badge") && meta) el("#eg-texas-badge").outerHTML = badgeHtml(meta.classification);
    if (el("#eg-texas-chapter")) {
      el("#eg-texas-chapter").innerHTML = chapterContentHtml(tx.blurb, tx.sections);
      if (window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(el("#eg-texas-chapter"));
    }
  }

  /* ---------- State grid (every other state) ---------- */
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
      <div id="eg-panel-content"><div class="gate-card is-loading">Loading chapter…</div></div>
    `;
    document.getElementById("eg-close-btn").addEventListener("click", panel._close);
    overlay.classList.add("open");
    panel.classList.add("open");
    document.body.style.overflow = "hidden";

    const contentSlot = document.getElementById("eg-panel-content");
    if (!sb) {
      contentSlot.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Couldn't load this chapter — try refreshing the page.</p></div>`;
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
        if (window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(contentSlot);
      } else {
        contentSlot.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">This chapter isn't available yet — check back soon.</p></div>`;
      }
    } catch (err) {
      contentSlot.innerHTML = `<div class="gate-card"><div class="eyebrow" style="margin-bottom:8px;">Something went wrong</div><p class="text-secondary" style="font-size:13.5px;">${(err && err.message) || "Couldn't load this chapter — try reopening it."}</p></div>`;
    }
  }

  renderMeta();
  renderByline();
  renderTexas();
  renderGrid();
})();
