/* =========================================================
   CREdocket — Litigation Value Estimator page logic
   ========================================================= */

(function () {
  "use strict";
  if (typeof CASE_VALUATION_DATA === "undefined" || !window.RELAW_VALUATION) return;
  const V = window.RELAW_VALUATION;
  const SPEC = CASE_VALUATION_DATA.spec.categories;
  const STATE_MODS = CASE_VALUATION_DATA.stateLawModifiers;
  const STATES = Object.keys(STATE_MODS).sort();

  const CATEGORIES = [
    { slug: "lease-disputes", label: "Landlord-Tenant / Lease Disputes" },
    { slug: "lending-foreclosure", label: "Lending & Foreclosure" },
    { slug: "reit-securities", label: "REIT & Real Estate Securities" },
    { slug: "construction-defect", label: "Construction Defect" },
    { slug: "environmental", label: "Environmental" },
    { slug: "eminent-domain", label: "Eminent Domain" },
    { slug: "zoning-land-use", label: "Zoning & Land Use" }
  ];

  const QUESTIONS = {
    "lease-disputes": [
      { key: "state", label: "Property state", type: "state" },
      { key: "unpaidRentAmount", label: "Unpaid rent accrued to date ($)", type: "number" },
      { key: "tenantDisputesDebt", label: "Does the tenant dispute the debt (e.g. claims rent abatement)?", type: "boolean" },
      { key: "hasWrittenLease", label: "Is there a written lease?", type: "boolean", default: true },
      { key: "leaseTerminated", label: "Has the lease been terminated / tenant vacated?", type: "boolean" },
      { key: "remainingMonths", label: "Months remaining on the lease term at termination", type: "number" },
      { key: "monthlyRent", label: "Monthly rent ($)", type: "number" },
      { key: "hasAccelerationClause", label: "Does the lease have an acceleration clause?", type: "select", options: ["yes", "no", "unsure"] },
      { key: "hasRelet", label: "Has the landlord already re-let the space?", type: "boolean" },
      { key: "reletRentAmount", label: "If re-let, new rent received over the overlapping period ($)", type: "number" },
      { key: "heldOverAfterTerm", label: "Did the tenant hold over after the lease term expired?", type: "boolean" },
      { key: "holdoverMonths", label: "Months held over", type: "number" },
      { key: "propertyDamageAmount", label: "Property damage / repair costs claimed ($)", type: "number" },
      { key: "selfHelpUsed", label: "Did the landlord use self-help (change locks, etc.)?", type: "boolean" },
      { key: "selfHelpProcessFollowed", label: "If self-help was used, was the state's required process followed?", type: "select", options: ["yes", "no", "unclear"] },
      { key: "wrongfulLockoutDamages", label: "If wrongful lockout: tenant's actual damages claimed (relocation, lost inventory/profits) ($)", type: "number" },
      { key: "repairFailureOrInterferenceClaimed", label: "Is the tenant alleging failure to repair / interference with use?", type: "boolean" },
      { key: "gaveCureNoticeLandlordFailedToAct", label: "Did the tenant give notice and the landlord fail to act?", type: "boolean" },
      { key: "depositAmount", label: "Security deposit amount ($)", type: "number" },
      { key: "depositDisputed", label: "Is the deposit withheld/disputed?", type: "boolean" },
      { key: "landlordProvidedItemization", label: "Did the landlord provide an itemization of deductions?", type: "boolean" },
      { key: "hasFeeShiftingClause", label: "Does the lease have an attorney's-fees (fee-shifting) clause?", type: "boolean" }
    ],
    "lending-foreclosure": [
      { key: "loanBalance", label: "Outstanding loan balance ($)", type: "number" },
      { key: "foreclosureFiled", label: "Has a foreclosure action been filed?", type: "boolean" },
      { key: "borrowerDisputesDefault", label: "Does the borrower dispute the default itself?", type: "boolean" },
      { key: "lenderAdvances", label: "Lender protective advances — taxes/insurance paid ($)", type: "number" },
      { key: "saleProceeds", label: "Foreclosure sale proceeds, if known ($)", type: "number" },
      { key: "receivershipMotionFiled", label: "Has a receivership motion been filed?", type: "boolean" },
      { key: "guarantyTriggerAlleged", label: "Is a guaranty carve-out trigger event alleged (fraud, waste, unauthorized transfer, etc.)?", type: "boolean" },
      { key: "guaranteedBalance", label: "Guaranteed loan balance ($)", type: "number" },
      { key: "lenderMisconductAlleged", label: "Does the borrower allege lender misconduct (bad faith, wrongful acceleration)?", type: "boolean" }
    ],
    "reit-securities": [
      { key: "stockDropAlleged", label: "Is a stock-price drop tied to a misrepresentation/omission alleged?", type: "boolean" },
      { key: "estimatedInvestorLosses", label: "Estimated aggregate investor losses ($)", type: "number" },
      { key: "hasCriminalConductOrAuditorOrControllingShareholder", label: "Is there criminal conduct, an auditor co-defendant, or controlling-shareholder self-dealing alleged?", type: "boolean" },
      { key: "boardBreachAlleged", label: "Is a board/sponsor fiduciary-duty breach alleged (derivative suit)?", type: "boolean" },
      { key: "tiedToConcreteSelfDealingTransaction", label: "Is it tied to a specific, quantifiable self-dealing transaction?", type: "boolean" },
      { key: "proxyOmissionAlleged", label: "Is a material omission in proxy/vote materials alleged?", type: "boolean" },
      { key: "specificInsiderStakeAlleged", label: "Is a specific, quantifiable undisclosed insider financial stake alleged?", type: "boolean" },
      { key: "mergerObjection", label: "Is this a merger/sale-terms objection suit?", type: "boolean" }
    ],
    "construction-defect": [
      { key: "contractorDefectAlleged", label: "Is a defect alleged against the general contractor?", type: "boolean" },
      { key: "repairCostEstimate", label: "Estimated repair cost ($)", type: "number" },
      { key: "catastrophicOrLifeSafety", label: "Is this a catastrophic/structural/life-safety failure (vs. a latent post-occupancy defect)?", type: "boolean" },
      { key: "designErrorAlleged", label: "Is a design error alleged against the architect/engineer?", type: "boolean" },
      { key: "multiplePartiesIndemnityExists", label: "Are there multiple responsible parties with an indemnity clause?", type: "boolean" },
      { key: "insurerDeniedCoverage", label: "Has a CGL insurer denied or disputed coverage?", type: "boolean" }
    ],
    "environmental": [
      { key: "cleanupCostsIncurred", label: "Cleanup/remediation costs incurred or estimated ($)", type: "number" },
      { key: "contaminationScale", label: "Contamination scale", type: "select", options: ["single-parcel", "multi-decade/waterway", "small-commercial-penalty"] },
      { key: "multiplePRPs", label: "Are there multiple potentially responsible parties (PRPs)?", type: "boolean" },
      { key: "stateConsentDecree", label: "Is this a state cleanup enforcement action / consent decree (not private litigation)?", type: "boolean" },
      { key: "insurerDeniedEnvCoverage", label: "Has an insurer denied environmental coverage?", type: "boolean" }
    ],
    "eminent-domain": [
      { key: "initialOffer", label: "Condemning authority's initial offer ($)", type: "number" },
      { key: "severanceOrBusinessValueDispute", label: "Does the dispute involve severance damages, access loss, or business value (not just land value)?", type: "boolean" },
      { key: "challengingTheTaking", label: "Is the owner challenging the taking itself (not just the value)?", type: "boolean" },
      { key: "opposingSurveyAccess", label: "Is this a pre-condemnation survey/access dispute?", type: "boolean" },
      { key: "regulatoryTakingAlleged", label: "Is a regulatory taking alleged (no formal condemnation filed)?", type: "boolean" },
      { key: "propertyFairMarketValue", label: "Property's fair market value, if a regulatory taking is alleged ($)", type: "number" }
    ],
    "zoning-land-use": [
      { key: "varianceOrPermitDenied", label: "Was a variance or permit denied and appealed?", type: "boolean" },
      { key: "spotZoningAlleged", label: "Is a rezoning being challenged as improper spot zoning?", type: "boolean" },
      { key: "arbitraryOrDiscriminatoryDenialAlleged", label: "Is an arbitrary or discriminatory zoning denial alleged (Section 1983)?", type: "boolean" },
      { key: "vestedRightPlusBadFaith", label: "Was a permit already issued, money spent, then the code changed to kill the project?", type: "boolean" },
      { key: "longPatternShiftingDemands", label: "Is there a long pattern of repeated, shifting requirements across applications?", type: "boolean" },
      { key: "noNoticeOrHearing", label: "Was there a complete absence of notice or hearing?", type: "boolean" },
      { key: "discriminatoryIntentEvidence", label: "Is there direct evidence of discriminatory intent?", type: "boolean" },
      { key: "lostValueEstimate", label: "Estimated lost project/development value ($)", type: "number" },
      { key: "developmentAgreementBreached", label: "Is a development agreement alleged to have been breached?", type: "boolean" }
    ]
  };

  const catSelect = document.getElementById("cv-category-select");
  const sideSelect = document.getElementById("cv-side-select");
  const formHost = document.getElementById("cv-form-host");
  const resultsHost = document.getElementById("cv-results-host");
  const form = document.getElementById("cv-form");
  if (!catSelect) return;

  CATEGORIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.slug;
    opt.textContent = c.label;
    catSelect.appendChild(opt);
  });

  function renderSideOptions(slug) {
    const roles = SPEC[slug].roles;
    sideSelect.innerHTML = `<option value="sideA">${roles.sideA}</option><option value="sideB">${roles.sideB}</option>`;
  }

  function questionInputHtml(q) {
    const id = "cv-q-" + q.key;
    if (q.type === "boolean") {
      return `<div class="cv-field">
        <label for="${id}">${q.label}</label>
        <select id="${id}" data-key="${q.key}" data-type="boolean">
          <option value="">—</option>
          <option value="true"${q.default ? " selected" : ""}>Yes</option>
          <option value="false">No</option>
        </select>
      </div>`;
    }
    if (q.type === "select") {
      return `<div class="cv-field">
        <label for="${id}">${q.label}</label>
        <select id="${id}" data-key="${q.key}" data-type="select">
          <option value="">—</option>
          ${q.options.map((o) => `<option value="${o}">${o}</option>`).join("")}
        </select>
      </div>`;
    }
    if (q.type === "state") {
      return `<div class="cv-field">
        <label for="${id}">${q.label}</label>
        <select id="${id}" data-key="${q.key}" data-type="state">
          <option value="">—</option>
          ${STATES.map((s) => `<option value="${s}">${s}</option>`).join("")}
        </select>
      </div>`;
    }
    return `<div class="cv-field">
      <label for="${id}">${q.label}</label>
      <input id="${id}" type="number" step="any" data-key="${q.key}" data-type="number" />
    </div>`;
  }

  function renderForm(slug) {
    formHost.innerHTML = QUESTIONS[slug].map(questionInputHtml).join("");
    resultsHost.innerHTML = "";
  }

  catSelect.addEventListener("change", () => {
    if (!catSelect.value) { formHost.innerHTML = ""; resultsHost.innerHTML = ""; return; }
    renderSideOptions(catSelect.value);
    renderForm(catSelect.value);
  });

  function collectFacts(slug) {
    const facts = {};
    formHost.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      const type = el.getAttribute("data-type");
      const raw = el.value;
      if (raw === "") return;
      if (type === "boolean") facts[key] = raw === "true";
      else if (type === "number") facts[key] = parseFloat(raw);
      else facts[key] = raw;
    });
    // pull in state-law modifiers for lease-disputes
    if (slug === "lease-disputes" && facts.state && STATE_MODS[facts.state]) {
      const m = STATE_MODS[facts.state];
      facts.mitigationDuty = m.mitigationDuty;
      facts.holdoverStatutoryPenalty = m.holdoverStatutoryPenalty;
      facts.selfHelpAvailable = m.selfHelpAvailable;
    }
    return facts;
  }

  function claimResultHtml(c) {
    const evRange = c.expectedValueRange;
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${c.label}</h4>
          <span class="cv-prob">${V.pct(c.probability)} likelihood</span>
        </div>
        ${c.damagesRange ? `<div class="cv-damages">Damages range: ${V.fmtRange(c.damagesRange[0], c.damagesRange[1])}</div>` : ""}
        ${evRange && !c.isBenchmark ? `<div class="cv-ev">Expected value: <strong>${V.fmtRange(evRange[0], evRange[1])}</strong></div>` : ""}
        ${c.note ? `<p class="cv-note">${c.note}</p>` : ""}
        ${c.citations.length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${c.citations.map((cit) => `
          <div class="cv-citation">
            <a href="${cit.sourceUrl}" target="_blank" rel="noopener">${cit.caseName}</a>
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${V.fmt(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const slug = catSelect.value;
    if (!slug) return;
    const facts = collectFacts(slug);
    const evalResult = V.evaluate(slug, facts);
    const side = sideSelect.value;
    const roles = evalResult.roles;
    const mySide = side === "sideA" ? evalResult.sideATotal : evalResult.sideBTotal;
    const otherSide = side === "sideA" ? evalResult.sideBTotal : evalResult.sideATotal;
    const net = [mySide[0] - otherSide[1], mySide[1] - otherSide[0]];

    if (!evalResult.claims.length) {
      resultsHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">No claims apply based on the facts entered — try filling in more fields above.</p></div>`;
      return;
    }

    resultsHost.innerHTML = `
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">Net Position — ${side === "sideA" ? roles.sideA : roles.sideB} view</div>
        <div class="cv-net">${V.fmtRange(net[0], net[1])}</div>
        <p class="text-muted" style="font-size:12.5px; margin-bottom:16px;">Sum of applicable claims' expected values, from the ${side === "sideA" ? roles.sideA : roles.sideB}'s perspective. This is a probability-informed estimate, not a prediction of any specific outcome — see the per-claim breakdown and cited cases below.</p>
        <button type="button" class="btn btn-ghost btn-sm" id="cv-download-report">
          Download PDF Report
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="cv-claims">${evalResult.claims.map(claimResultHtml).join("")}</div>
    `;

    const downloadBtn = document.getElementById("cv-download-report");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (window.CV_REPORT) {
          window.CV_REPORT.requestFullReport(evalResult, {
            categoryLabel: evalResult.categoryLabel,
            roles,
            side,
            net,
            catSpec: SPEC[slug]
          });
        }
      });
    }
  });
})();
