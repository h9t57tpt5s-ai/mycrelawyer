/* =========================================================
   CREdocket — Premises Liability & Negligence Handbook page logic
   Unlike the Commercial Eviction Handbook, every jurisdiction here is
   free — there is no purchase gate. This page renders straight from
   premisesLiabilityStateModifiers in js/case-valuation-data.js, the
   same 51-jurisdiction table that powers the Case Value Calculator's
   Premises Liability / Negligence category, so the two never drift.
   ========================================================= */

(function () {
  "use strict";
  if (typeof CASE_VALUATION_DATA === "undefined") return;
  const MODS = CASE_VALUATION_DATA.premisesLiabilityStateModifiers;
  if (!MODS) return;

  const STATES = Object.keys(MODS).sort();

  // Five real, distinct fault-allocation regimes -- see the note on each
  // state entry in case-valuation-data.js for the underlying research.
  const FAULT_RULE_COLORS = {
    "Pure Contributory": "#dc2626",
    "Modified Comparative (50% Bar)": "#d97706",
    "Modified Comparative (51% Bar)": "#2563eb",
    "Pure Comparative": "#16a34a",
    "Slight/Gross (unique -- see note)": "#7c3aed"
  };
  function ruleColor(rule) { return FAULT_RULE_COLORS[rule] || "#64748b"; }
  function ruleShortLabel(rule) {
    if (rule === "Slight/Gross (unique -- see note)") return "Slight/Gross (SD only)";
    return rule || "Not researched";
  }

  function el(sel) { return document.querySelector(sel); }

  function renderLegend() {
    const legend = el("#pl-legend");
    if (!legend) return;
    const order = ["Pure Contributory", "Modified Comparative (50% Bar)", "Modified Comparative (51% Bar)", "Pure Comparative", "Slight/Gross (unique -- see note)"];
    legend.innerHTML = order.map((r) => `<span><span class="eg-dot" style="background:${ruleColor(r)};"></span>${ruleShortLabel(r)}</span>`).join("");
  }

  function badgeHtml(rule) {
    const color = ruleColor(rule);
    return `<span class="badge eg-classification-badge" style="background:color-mix(in srgb, ${color} 16%, transparent); color:${color}; border:1px solid color-mix(in srgb, ${color} 35%, transparent);"><span class="badge-dot" style="background:${color}"></span>${ruleShortLabel(rule)}</span>`;
  }

  function renderGrid() {
    const grid = el("#pl-state-grid");
    if (!grid) return;
    grid.innerHTML = STATES.map((name) => `
      <button type="button" class="eg-state-card" data-state="${name}">
        <div>
          <div class="eg-state-card-name">${name}</div>
          <div class="eg-state-card-meta">
            <span class="eg-state-card-class" style="color:${ruleColor(MODS[name].faultRule)};">${ruleShortLabel(MODS[name].faultRule)}</span>
          </div>
        </div>
      </button>`
    ).join("");
    grid.querySelectorAll(".eg-state-card").forEach((card) => {
      card.addEventListener("click", () => openStatePanel(card.getAttribute("data-state")));
    });
  }

  let overlay, panel;
  function buildPanel() {
    if (panel) return;
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

  function sectionHtml(label, bodyHtml, extra) {
    return `<div class="eg-chapter-section">${extra ? `<div class="pl-section-top"><h3>${label}</h3>${extra}</div>` : `<h3>${label}</h3>`}<p>${bodyHtml}</p></div>`;
  }
  function citeLine(citation) {
    return citation ? ` <em>— ${citation}</em>` : ` <em>— citation not independently confirmed; verify before relying on this.</em>`;
  }
  // Small inline pill used next to a section heading to flag this
  // research pass's own honest confidence in that specific claim, when
  // the underlying field's citation is missing/unconfirmed -- keeps the
  // "never fabricate precision" discipline visible at the point of use,
  // not just buried in a footer.
  function unverifiedPill(citation) {
    return citation ? "" : `<span class="pl-unverified-pill">not independently verified</span>`;
  }
  function boolLabel(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (v === "partial") return "Partially";
    return "Unclear";
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to read this chapter</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">This guide is free with a CREdocket account — no purchase required.</p>
        <button type="button" class="btn btn-primary btn-sm pl-signin-btn">Sign in to continue</button>
      </div>`;
  }

  function buildSectionsHtml(m) {
    const elementsList = Array.isArray(m.elementsToProve) && m.elementsToProve.length
      ? `<ol class="pl-elements-list">${m.elementsToProve.map((e) => `<li>${e}</li>`).join("")}</ol>`
      : `<p>${m.elementsToProve || "Not yet researched."}</p>`;

    const sections = [
      // 1. Visitor classification
      sectionHtml(
        "Visitor Classification System",
        `${m.visitorClassificationSystem || "Not yet researched"}${citeLine(m.visitorClassificationCitation)}<br/><br/>${m.visitorClassificationNote || ""}`,
        unverifiedPill(m.visitorClassificationCitation)
      ),
      // 2. Elements (rendered as an ordered list, not just a paragraph)
      `<div class="eg-chapter-section"><div class="pl-section-top"><h3>Elements to Prove</h3>${unverifiedPill(m.elementsCitation)}</div>${elementsList}<p class="pl-cite-line">${citeLine(m.elementsCitation)}</p></div>`,
      // 3. Distinct-from-ordinary-negligence
      sectionHtml(
        `Is This Its Own Claim, Distinct From Ordinary Negligence? ${m.premisesLiabilityDistinctFromOrdinaryNegligence ? '<span class="pl-yes-badge">YES</span>' : '<span class="pl-no-badge">NO</span>'}`,
        m.premisesLiabilityDistinctNote || "Not yet researched."
      ),
      // 4. Notice + mode of operation
      sectionHtml(
        `Notice Requirement &amp; the "Mode of Operation" Rule`,
        `${m.noticeRule || "Not yet researched."}<br/><br/><strong>Mode-of-operation rule adopted:</strong> ${boolLabel(m.modeOfOperationRuleAdopted)}${citeLine(m.modeOfOperationCitation)}`
      ),
      // 5. Open and obvious
      sectionHtml(
        "Open &amp; Obvious Hazards",
        `${m.openAndObviousDoctrine || "Not yet researched"}${citeLine(m.openAndObviousCitation)}<br/><br/>${m.openAndObviousNote || ""}`,
        unverifiedPill(m.openAndObviousCitation)
      ),
      // 6. Attractive nuisance
      sectionHtml(
        "Attractive Nuisance",
        `${m.attractiveNuisanceDoctrine || "Not yet researched"}${citeLine(m.attractiveNuisanceCitation)}<br/><br/>${m.attractiveNuisanceNote || ""}`,
        unverifiedPill(m.attractiveNuisanceCitation)
      ),
      // 7. Negligent security / crime on premises
      sectionHtml(
        "When a Crime Is Committed on the Premises: Negligent Security",
        `<strong>Foreseeability test:</strong> ${m.negligentSecurityForeseeabilityTest || "Not yet researched"}${citeLine(m.negligentSecurityCitation)}<br/><br/>${m.negligentSecurityNote || ""}`,
        unverifiedPill(m.negligentSecurityCitation)
      ),
      // 8. Comparative/contributory fault
      sectionHtml(
        "Comparative / Contributory Fault Rule",
        `${m.faultRule || "Not yet researched"}${citeLine(m.faultRuleCitation)}`
      ),
      // 9. Other defenses
      sectionHtml("Other State-Specific Defenses", m.additionalDefenses || "None identified beyond the fault rule and doctrines above."),
      // 10. Punitive damages
      sectionHtml("Punitive Damages: Evidentiary Standard", m.punitiveDamagesStandard || "Not yet researched"),
      sectionHtml("Punitive Damages: Statutory Cap", m.punitiveDamagesCap || "Not yet researched")
    ];
    if (m.note) sections.push(sectionHtml("Practitioner Note (Fault/Punitive Damages)", m.note));
    if (m.researchConfidence) {
      sections.push(`<div class="eg-chapter-section pl-confidence-footer"><h3>Research Confidence</h3><p>${m.researchConfidence}. This reflects the researcher's own honest self-assessment — any field above flagged "not independently verified" should be confirmed against a primary source before being relied on in an actual matter.</p></div>`);
    }
    return sections.join("");
  }

  function hasSession() {
    return !!(window.RELAW_AUTH && window.RELAW_AUTH.getSession());
  }

  const PENDING_STATE_KEY = "credocket_pending_pl_state";
  const PENDING_STATE_MAX_AGE_MS = 30 * 60 * 1000;
  function setPendingState(name) {
    localStorage.setItem(PENDING_STATE_KEY, JSON.stringify({ name, savedAt: Date.now() }));
  }
  function resumePendingStateIfAny() {
    if (!hasSession()) return;
    const raw = localStorage.getItem(PENDING_STATE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_STATE_KEY);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    if (!parsed || !parsed.name || Date.now() - parsed.savedAt > PENDING_STATE_MAX_AGE_MS) return;
    openStatePanel(parsed.name);
  }

  function openStatePanel(name) {
    buildPanel();
    const m = MODS[name];
    if (!m) return;

    panel.innerHTML = `
      <div class="top-row">
        <span class="badge badge-live">Premises Liability / Negligence</span>
        <button class="detail-close" aria-label="Close" id="pl-close-btn">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <h2>${name}</h2>
      ${badgeHtml(m.faultRule)}
      <div class="rule mt-24" style="margin-bottom:24px;"></div>
      <div id="pl-panel-content"></div>
    `;
    document.getElementById("pl-close-btn").addEventListener("click", panel._close);
    overlay.classList.add("open");
    panel.classList.add("open");
    panel.scrollTop = 0;
    document.body.style.overflow = "hidden";

    const contentSlot = document.getElementById("pl-panel-content");
    if (!hasSession()) {
      contentSlot.innerHTML = signInCardHtml();
      const btn = contentSlot.querySelector(".pl-signin-btn");
      if (btn) btn.addEventListener("click", () => {
        setPendingState(name);
        window.RELAW_AUTH.openSignInModal();
      });
      return;
    }
    contentSlot.innerHTML = buildSectionsHtml(m);
    if (window.RELAW_UTILS && window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(panel);
  }

  renderLegend();
  renderGrid();

  // Resume an intended state panel after sign-in, same pattern as
  // js/eviction-guide.js's pending-state flow but scoped to this page.
  if (window.RELAW_SUPABASE) {
    window.RELAW_SUPABASE.auth.onAuthStateChange(() => resumePendingStateIfAny());
    setTimeout(resumePendingStateIfAny, 400);
  }
})();
