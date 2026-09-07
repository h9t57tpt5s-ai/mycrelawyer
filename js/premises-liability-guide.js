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

  function sectionHtml(label, bodyHtml) {
    return `<div class="eg-chapter-section"><h3>${label}</h3><p>${bodyHtml}</p></div>`;
  }

  function openStatePanel(name) {
    buildPanel();
    const m = MODS[name];
    if (!m) return;
    const punitiveStandard = m.punitiveDamagesStandard || "Not yet researched";
    const punitiveCap = m.punitiveDamagesCap || "Not yet researched";
    const sections = [
      sectionHtml("Comparative / Contributory Fault Rule", `${m.faultRule}${m.faultRuleCitation ? ` — <em>${m.faultRuleCitation}</em>` : ""}`),
      sectionHtml("Punitive Damages: Evidentiary Standard", punitiveStandard),
      sectionHtml("Punitive Damages: Statutory Cap", punitiveCap)
    ];
    if (m.note) sections.push(sectionHtml("Practitioner Note", m.note));

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
      <div id="pl-panel-content">
        <div class="eg-chapter-blurb">Elements to prove, defenses generally available, and how punitive damages work are the same nationwide framework covered above — this panel covers only what is genuinely STATE-SPECIFIC: the fault rule and the punitive-damages standard/cap.</div>
        ${sections.join("")}
      </div>
    `;
    document.getElementById("pl-close-btn").addEventListener("click", panel._close);
    if (window.RELAW_UTILS && window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(panel);
    overlay.classList.add("open");
    panel.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  renderLegend();
  renderGrid();
})();
