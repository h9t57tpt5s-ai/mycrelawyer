/* =========================================================
   CREdocket — ADA Title III Risk Flagging page logic
   ========================================================= */

(function () {
  "use strict";
  if (typeof ADA_RISK_DATA === "undefined" || typeof RELAW_DATA === "undefined") return;

  const stateSelect = document.getElementById("ar-state");
  const propertyTypeSelect = document.getElementById("ar-property-type");
  const resultsHost = document.getElementById("ar-results");
  const disclaimerEl = document.getElementById("ar-disclaimer");
  if (!stateSelect) return;

  disclaimerEl.textContent = ADA_RISK_DATA.disclaimer;

  Object.values(RELAW_DATA.states).sort().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    stateSelect.appendChild(opt);
  });
  Object.entries(ADA_RISK_DATA.propertyTypes).forEach(([key, spec]) => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = spec.label;
    propertyTypeSelect.appendChild(opt);
  });

  function render() {
    const stateName = stateSelect.value;
    const propType = propertyTypeSelect.value;
    if (!stateName || !propType) {
      resultsHost.innerHTML = "";
      return;
    }

    const volume = ADA_RISK_DATA.stateFilingVolume[stateName];
    const tierKey = volume ? volume.tier : "moderate-low";
    const tierMeta = ADA_RISK_DATA.tierMeta[tierKey];
    const overlay = ADA_RISK_DATA.stateOverlays[stateName];
    const propSpec = ADA_RISK_DATA.propertyTypes[propType];

    const volumeText = volume
      ? `${volume.count.toLocaleString()} federal ADA Title III lawsuits filed in ${stateName} in 2025.${volume.note ? " " + volume.note : ""}`
      : `No high-volume federal filing count independently confirmed for ${stateName} — it did not appear in the top-10 filing states or the confirmed-zero states for 2025.`;

    const plaintiffsHtml = renderPlaintiffsForState(stateName);

    const overlayHtml = overlay
      ? `<div class="card" style="padding:20px; margin-top:16px;">
          <div class="eyebrow" style="margin-bottom:8px;">${stateName} State-Law Overlay</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.65; margin-bottom:${overlay.details.length ? "10px" : "0"};">${overlay.summary}</p>
          ${overlay.details.length ? `<ul class="ar-list">${overlay.details.map((d) => `<li>${d}</li>`).join("")}</ul>` : ""}
        </div>`
      : `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:8px;">${stateName} State-Law Overlay</div><p class="text-secondary" style="font-size:13.5px; line-height:1.65;">No state-law damages overlay or pre-suit notice requirement specific to physical-barrier ADA claims was confirmed for ${stateName} — the federal baseline below applies.</p></div>`;

    resultsHost.innerHTML = `
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">Filing-Volume Risk Tier — ${stateName}</div>
        <div class="ar-tier" style="color:var(${tierMeta.color});">${tierMeta.label}</div>
        <p class="text-secondary" style="font-size:13px; margin-top:10px; line-height:1.6;">${volumeText}</p>
      </div>

      <div class="card" style="padding:20px; margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">Federal Baseline (Applies Everywhere)</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.65;">${ADA_RISK_DATA.federalBaseline}</p>
      </div>

      ${overlayHtml}

      <div class="card" style="padding:20px; margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">${propSpec.label} — Common Risk Areas</div>
        <ul class="ar-list">${propSpec.riskFactors.map((f) => `<li>${f}</li>`).join("")}</ul>
      </div>

      ${plaintiffsHtml}`;
    resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Cross-link to js/ada-serial-plaintiffs-data.js's directory, filtered to
  // the selected state -- this is what turns "here's the abstract risk
  // tier" into "here's who's actually filing these in your state." Guarded
  // separately since this page should keep working even if that data file
  // isn't loaded for some reason.
  function renderPlaintiffsForState(stateName) {
    if (typeof ADA_SERIAL_PLAINTIFFS_DATA === "undefined") return "";
    const matches = ADA_SERIAL_PLAINTIFFS_DATA.entries.filter((p) => p.jurisdictions.includes(stateName));
    if (!matches.length) {
      return `<div class="card" style="padding:20px; margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">Serial Plaintiffs Active in ${stateName}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.65;">None of the named plaintiffs/firms profiled in our <a href="ada-serial-plaintiffs.html" class="text-accent" style="display:inline;">Serial Plaintiff Profiles</a> directory are confirmed active in ${stateName} specifically — that reflects the scope of sourced research so far, not an absence of filing activity in the state.</p>
      </div>`;
    }
    return `<div class="card" style="padding:20px; margin-top:16px;">
      <div class="eyebrow" style="margin-bottom:10px;">Serial Plaintiffs Active in ${stateName}</div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${matches.map((p) => `
          <a href="ada-plaintiff-${p.slug}.html" style="display:block; padding:12px 14px; border:1px solid var(--border-soft); border-radius:8px; text-decoration:none;">
            <p style="font-size:13.5px; font-weight:600; color:var(--text-primary); margin-bottom:2px;">${p.name}</p>
            <p class="text-muted" style="font-size:12px;">${p.filingVolume.text} — ${p.targetNote}</p>
          </a>`).join("")}
      </div>
      <p class="text-muted mt-16" style="font-size:12px;"><a href="ada-serial-plaintiffs.html" class="text-accent" style="display:inline;">View all serial plaintiff profiles →</a></p>
    </div>`;
  }

  stateSelect.addEventListener("change", render);
  propertyTypeSelect.addEventListener("change", render);
})();
