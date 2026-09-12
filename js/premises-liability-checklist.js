/* =========================================================
   CREdocket — Premises Liability Checklist (Manager Edition) page logic
   Renders the static checklists from PREMISES_CHECKLIST_DATA
   (js/premises-liability-checklist-data.js), plus a per-state
   quick-reference panel that reads directly from
   CASE_VALUATION_DATA.premisesLiabilityStateModifiers (case-
   valuation-data.js) and EVICTION_GUIDE_DATA.states (eviction-
   guide-data.js) -- neither file is modified here. Both source
   files are optional at runtime: if either fails to load, the
   corresponding half of the quick-reference panel is simply
   omitted rather than the page breaking.
   ========================================================= */

(function () {
  "use strict";
  if (typeof PREMISES_CHECKLIST_DATA === "undefined") return;

  function el(sel) { return document.querySelector(sel); }

  function renderDisclaimer() {
    const d = el("#pc-disclaimer");
    if (d) d.textContent = PREMISES_CHECKLIST_DATA.disclaimer;
  }

  function renderChecklist(hostId, items) {
    const host = el(hostId);
    if (!host) return;
    host.innerHTML = items.map((i) => `
      <li class="pc-check-item">
        <span class="pc-check-box" aria-hidden="true"></span>
        <span class="pc-check-text">${i}</span>
      </li>`).join("");
  }

  function renderInjuryWhy() {
    const p = el("#pc-injury-why");
    if (p) p.textContent = PREMISES_CHECKLIST_DATA.injuryWhyItMatters;
  }

  function findEvictionState(name) {
    if (typeof EVICTION_GUIDE_DATA === "undefined") return null;
    return EVICTION_GUIDE_DATA.states.find((s) => s.name === name) || null;
  }

  function boolLabel(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (v === "partial") return "Partially";
    return "Unclear";
  }

  // Same fault-rule color coding js/premises-liability-guide.js uses for
  // its own state grid, so a state card means the same thing (visually)
  // wherever it appears on the site.
  const FAULT_RULE_COLORS = {
    "Pure Contributory": "var(--cat-construction)",
    "Modified Comparative (50% Bar)": "var(--cat-reit)",
    "Modified Comparative (51% Bar)": "var(--cat-landlord)",
    "Pure Comparative": "var(--cat-zoning)",
    "Slight/Gross (unique -- see note)": "var(--cat-lending)",
  };
  function ruleColor(rule) { return FAULT_RULE_COLORS[rule] || "var(--text-muted)"; }

  function renderStatePicker() {
    const grid = el("#pc-state-grid");
    const host = el("#pc-state-result");
    if (!grid || typeof CASE_VALUATION_DATA === "undefined") return;
    const MODS = CASE_VALUATION_DATA.premisesLiabilityStateModifiers;
    if (!MODS) return;
    const states = Object.keys(MODS).sort();

    // Same .eg-state-card/.eg-state-grid component the two handbook
    // pages use (css/eviction-guide.css, already loaded here) -- was a
    // native <select> before, which hides all 51 options behind one
    // click; a grid can be scanned at a glance instead.
    grid.innerHTML = states.map((name) => `
      <button type="button" class="eg-state-card" data-state="${name}">
        <div>
          <div class="eg-state-card-name">${name}</div>
          <div class="eg-state-card-meta">
            <span class="eg-state-card-class" style="color:${ruleColor(MODS[name].faultRule)};">${MODS[name].faultRule || "Not researched"}</span>
          </div>
        </div>
      </button>`).join("");

    grid.querySelectorAll(".eg-state-card").forEach((card) => {
      card.addEventListener("click", () => {
        const name = card.getAttribute("data-state");
        grid.querySelectorAll(".eg-state-card").forEach((c) => c.classList.toggle("is-active", c === card));
        renderStateResult(name);
      });
    });

    function renderStateResult(name) {
      const m = MODS[name];
      const ev = findEvictionState(name);

      const lockoutHtml = ev
        ? `<div class="card" style="padding:20px; margin-top:14px;">
            <div class="eyebrow" style="margin-bottom:8px;">${name} — Self-Help / Lockout</div>
            <p class="text-secondary" style="font-size:13.5px; line-height:1.7;"><strong>${ev.selfHelpAvailable}</strong> — general orientation classification: <strong>${ev.classification}</strong>. Read the full chapter, including the exact statutory conditions, in the <a href="eviction-guide.html" class="text-accent" style="display:inline;">Commercial Eviction Handbook</a> before acting.</p>
          </div>`
        : `<div class="card" style="padding:20px; margin-top:14px;"><div class="eyebrow" style="margin-bottom:8px;">${name} — Self-Help / Lockout</div><p class="text-secondary" style="font-size:13.5px; line-height:1.7;">See the <a href="eviction-guide.html" class="text-accent" style="display:inline;">Commercial Eviction Handbook</a> for this state's self-help/lockout rules.</p></div>`;

      host.innerHTML = `
        <div class="card" style="padding:20px; margin-top:16px;">
          <div class="eyebrow" style="margin-bottom:8px;">${name} — Notice Rule &amp; Mode of Operation</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${m.noticeRule || "Not yet researched."}</p>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7; margin-top:8px;"><strong>Mode-of-operation rule adopted (can let a claimant skip proving notice of this specific hazard):</strong> ${boolLabel(m.modeOfOperationRuleAdopted)}.</p>
        </div>
        <div class="card" style="padding:20px; margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:8px;">${name} — Open &amp; Obvious Hazards</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${m.openAndObviousDoctrine || "Not yet researched"}${m.openAndObviousNote ? " " + m.openAndObviousNote : ""}</p>
        </div>
        <div class="card" style="padding:20px; margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:8px;">${name} — Comparative/Contributory Fault</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${m.faultRule || "Not yet researched"}${m.note ? " " + m.note : ""}</p>
        </div>
        ${lockoutHtml}
        <p class="text-muted mt-16" style="font-size:12px;"><a href="premises-liability-guide.html" class="text-accent" style="display:inline;">Read ${name}'s full Premises Liability Guide chapter for citations and complete analysis →</a></p>
      `;
      host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  renderDisclaimer();
  renderChecklist("#pc-injury-list", PREMISES_CHECKLIST_DATA.injuryChecklist);
  renderInjuryWhy();
  renderChecklist("#pc-lockout-list", PREMISES_CHECKLIST_DATA.lockoutChecklist);
  renderChecklist("#pc-doc-list", PREMISES_CHECKLIST_DATA.documentationChecklist);
  renderStatePicker();
})();
