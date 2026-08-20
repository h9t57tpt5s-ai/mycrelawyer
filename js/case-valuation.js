/* =========================================================
   CREdocket -- Case Value Estimator: wizard UI controller
   ========================================================= */

(function () {
  "use strict";

  const root = document.getElementById("cv-app");
  if (!root) return;

  const STATES = Object.keys(CV_STATE_MODIFIERS || {}).sort();

  const state = {
    step: 0,
    answers: {
      role: null, state: null, monthlyRent: null, remainingMonths: null,
      hasWrittenLease: null, hasAccelerationClause: null, hasFeeShiftingClause: null,
      leaseWaivesConsequentialDamages: null, leaseTerminated: null,
      unpaidRentAmount: 0, tenantDisputesDebt: false, propertyDamageAmount: 0,
      heldOverAfterTerm: false, holdoverMonths: 0, selfHelpUsedByLandlord: false,
      landlordFollowedProcess: null, landlordRelet: false, reletMonthlyRent: 0,
      selfHelpUsedAgainstTenant: false, processFollowedByLandlord: null,
      repairFailureClaimed: false, gaveCureNotice: false, lostProfitsEstimate: 0,
      relocationCostEstimate: 0, depositAmount: 0, depositDisputed: false,
      depositItemized: null, backRentOwed: 0,
    },
    result: null,
  };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmtMoney(n) { return "$" + Math.round(n).toLocaleString(); }
  function fmtMoneyRange(range) { return fmtMoney(range[0]) + " – " + fmtMoney(range[1]); }

  // ---------- step definitions ----------
  function stepsFor(answers) {
    const s = [];
    s.push({ key: "role_state", title: "Your role & jurisdiction", render: renderRoleState });
    s.push({ key: "lease_basics", title: "Lease basics", render: renderLeaseBasics });
    if (answers.role === "landlord") {
      s.push({ key: "landlord_facts_1", title: "Rent & possession", render: renderLandlordFacts1 });
      s.push({ key: "landlord_facts_2", title: "Self-help & mitigation", render: renderLandlordFacts2 });
    } else if (answers.role === "tenant") {
      s.push({ key: "tenant_facts_1", title: "What happened", render: renderTenantFacts1 });
      s.push({ key: "tenant_facts_2", title: "Deposit & counter-exposure", render: renderTenantFacts2 });
    }
    s.push({ key: "results", title: "Your estimate", render: renderResults });
    return s;
  }

  function fieldMoney(label, key, hint) {
    return `
      <div class="cv-field">
        <label class="cv-field-label">${label}</label>
        <div class="cv-money-wrap"><input class="cv-input" type="number" min="0" step="1" data-key="${key}" value="${state.answers[key] || ""}" placeholder="0" /></div>
        ${hint ? `<div class="cv-field-hint">${hint}</div>` : ""}
      </div>`;
  }
  function fieldNumber(label, key, hint) {
    return `
      <div class="cv-field">
        <label class="cv-field-label">${label}</label>
        <input class="cv-input" type="number" min="0" step="1" data-key="${key}" value="${state.answers[key] || ""}" placeholder="0" />
        ${hint ? `<div class="cv-field-hint">${hint}</div>` : ""}
      </div>`;
  }
  function fieldChoice(label, key, options, hint) {
    return `
      <div class="cv-field">
        <label class="cv-field-label">${label}</label>
        <div class="cv-choice-row" data-choice-key="${key}">
          ${options.map((o) => `<button type="button" class="cv-choice-btn${state.answers[key] === o.value ? " is-selected" : ""}" data-value="${esc(String(o.value))}">${o.label}</button>`).join("")}
        </div>
        ${hint ? `<div class="cv-field-hint">${hint}</div>` : ""}
      </div>`;
  }

  function renderRoleState() {
    return `
      ${fieldChoice("Are you the landlord or the tenant in this dispute?", "role", [
        { value: "landlord", label: "Landlord" },
        { value: "tenant", label: "Tenant" },
      ])}
      <div class="cv-field">
        <label class="cv-field-label">Where is the leased property located?</label>
        <select class="cv-select" data-key="state">
          <option value="">Select a state…</option>
          ${STATES.map((st) => `<option value="${esc(st)}" ${state.answers.state === st ? "selected" : ""}>${esc(st)}</option>`).join("")}
        </select>
        <div class="cv-field-hint">This determines which state's verified commercial-eviction law drives your estimate.</div>
      </div>`;
  }

  function renderLeaseBasics() {
    return `
      ${fieldMoney("Monthly base rent", "monthlyRent")}
      ${fieldNumber("Remaining lease term at the time of the dispute (months)", "remainingMonths")}
      ${fieldChoice("Is there a written lease?", "hasWrittenLease", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${fieldChoice("Has the lease been terminated / did the tenant vacate?", "leaseTerminated", [
        { value: "true", label: "Yes" }, { value: "false", label: "No, still in effect" },
      ])}
      ${fieldChoice("Does the lease include a rent-acceleration clause?", "hasAccelerationClause", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" }, { value: "unsure", label: "Not sure" },
      ])}
      ${fieldChoice("Does the lease have an attorney's-fees (fee-shifting) clause?", "hasFeeShiftingClause", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" }, { value: "unsure", label: "Not sure" },
      ])}
      ${fieldChoice("Does the lease waive consequential / lost-profits damages?", "leaseWaivesConsequentialDamages", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" }, { value: "unsure", label: "Not sure" },
      ])}`;
  }

  function renderLandlordFacts1() {
    return `
      ${fieldMoney("Unpaid rent accrued to date", "unpaidRentAmount")}
      ${fieldChoice("Does the tenant dispute owing this amount?", "tenantDisputesDebt", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${fieldMoney("Property damage / repair costs beyond normal wear (if any)", "propertyDamageAmount")}
      ${fieldChoice("Did the tenant hold over after the lease term expired?", "heldOverAfterTerm", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${state.answers.heldOverAfterTerm === true || state.answers.heldOverAfterTerm === "true" ? fieldNumber("How many months did the tenant hold over?", "holdoverMonths") : ""}`;
  }

  function renderLandlordFacts2() {
    return `
      ${fieldChoice("Did you use self-help (changing locks) rather than a judicial eviction process?", "selfHelpUsedByLandlord", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${fieldChoice("Have you attempted to re-let the premises?", "landlordRelet", [
        { value: "true", label: "Yes" }, { value: "false", label: "Not yet" },
      ])}
      ${(state.answers.landlordRelet === true || state.answers.landlordRelet === "true") ? fieldMoney("New tenant's monthly rent (if re-let)", "reletMonthlyRent") : ""}`;
  }

  function renderTenantFacts1() {
    return `
      ${fieldChoice("Was self-help (a lockout / changed locks) used against you?", "selfHelpUsedAgainstTenant", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${(state.answers.selfHelpUsedAgainstTenant === true || state.answers.selfHelpUsedAgainstTenant === "true") ? fieldChoice("Did the landlord follow this state's required notice/process for a lockout?", "processFollowedByLandlord", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" }, { value: "unsure", label: "Not sure" },
      ]) : ""}
      ${fieldChoice("Did the landlord fail to make required repairs or otherwise interfere with your use of the space?", "repairFailureClaimed", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${(state.answers.repairFailureClaimed === true || state.answers.repairFailureClaimed === "true") ? fieldChoice("Did you give the landlord notice and a chance to fix it?", "gaveCureNotice", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ]) : ""}
      ${fieldMoney("Estimated lost business profits from this (if any)", "lostProfitsEstimate")}
      ${fieldMoney("Relocation / replacement-space costs (if any)", "relocationCostEstimate")}`;
  }

  function renderTenantFacts2() {
    return `
      ${fieldMoney("Security deposit amount", "depositAmount")}
      ${fieldChoice("Is the deposit being disputed / wrongfully withheld?", "depositDisputed", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ])}
      ${(state.answers.depositDisputed === true || state.answers.depositDisputed === "true") ? fieldChoice("Did the landlord provide an itemized accounting of deductions?", "depositItemized", [
        { value: "true", label: "Yes" }, { value: "false", label: "No" },
      ]) : ""}
      ${fieldMoney("Back rent the landlord will likely counterclaim for (if any)", "backRentOwed")}`;
  }

  function coerce(a) {
    // normalize string "true"/"false"/"unsure" choice values into usable types
    const out = Object.assign({}, a);
    ["hasWrittenLease", "leaseTerminated", "tenantDisputesDebt", "heldOverAfterTerm",
     "selfHelpUsedByLandlord", "landlordRelet", "selfHelpUsedAgainstTenant",
     "repairFailureClaimed", "gaveCureNotice", "depositDisputed"].forEach((k) => {
      if (out[k] === "true") out[k] = true;
      else if (out[k] === "false") out[k] = false;
    });
    ["hasAccelerationClause", "hasFeeShiftingClause", "leaseWaivesConsequentialDamages",
     "landlordFollowedProcess", "processFollowedByLandlord", "depositItemized"].forEach((k) => {
      if (out[k] === "true") out[k] = true;
      else if (out[k] === "false") out[k] = false;
      // "unsure" stays as the string "unsure"
    });
    ["monthlyRent", "remainingMonths", "unpaidRentAmount", "propertyDamageAmount", "holdoverMonths",
     "reletMonthlyRent", "lostProfitsEstimate", "relocationCostEstimate", "depositAmount", "backRentOwed"].forEach((k) => {
      out[k] = out[k] ? Number(out[k]) : 0;
    });
    return out;
  }

  function claimCiteBlock(citations) {
    if (!citations || !citations.length) return "";
    return `<div class="cv-claim-cites"><strong>Comparable ${citations.length > 1 ? "cases" : "case"}:</strong> ${citations.map((c) => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label)}</a>`).join(" · ")}</div>`;
  }

  function renderResults() {
    const answers = coerce(state.answers);
    const result = CV_ENGINE.calculate(answers);
    state.result = result;

    if (!result.claims.length) {
      return `<div class="cv-locked-note">Based on your answers, no claims with an estimable value were identified. Try going back and adding more facts (unpaid rent, a lockout, damage, etc.).</div>`;
    }

    const perspectiveLabel = answers.role === "landlord" ? "Your likely net recovery" : "Your likely net exposure/recovery";

    const claimsHtml = result.claims.map((c) => `
      <div class="cv-claim-card">
        <div class="cv-claim-head">
          <span class="cv-claim-name">${esc(c.label)}</span>
          <span class="cv-claim-side ${c.side === "landlord" ? "landlord" : "tenant"}">${c.side === "landlord" ? "Landlord claim" : "Tenant claim"}</span>
        </div>
        <div class="cv-claim-value">${fmtMoneyRange(c.expectedRange)} expected value</div>
        <div class="cv-claim-prob">Probability of success: ${Math.round(c.probabilityRange[0] * 100)}–${Math.round(c.probabilityRange[1] * 100)}% · Damages if successful: ${fmtMoneyRange(c.damagesRange)}</div>
        <div class="cv-claim-why">${esc(c.why)}</div>
        ${claimCiteBlock(c.citations)}
      </div>`).join("");

    const hasAcceleratedRent = result.claims.some((c) => c.key === "accelerated_rent");
    const bankruptcyNote = hasAcceleratedRent ? `
      <div class="cv-locked-note" style="text-align:left; margin-bottom:24px;">
        <strong>Note on the Accelerated/Future Rent figure:</strong> if the tenant is (or becomes) a debtor in bankruptcy, 11 U.S.C. § 502(b)(6) caps a landlord's future-rent claim regardless of what the lease's acceleration clause says — generally to the greater of one year's rent or 15% of the remaining term (capped at three years), plus unpaid rent already due. This overrides the estimate above whenever bankruptcy is or becomes a factor.
      </div>` : "";

    return `
      <div class="cv-results-hero">
        <div class="cv-results-range">${fmtMoneyRange(result.totalRange)}</div>
        <div class="cv-results-caption">${perspectiveLabel} — expected value range across all identified claims, ${esc(answers.state)}</div>
      </div>
      <div class="cv-claim-list">${claimsHtml}</div>
      ${bankruptcyNote}
      <div class="cv-report-cta">
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">Full Report</div>
          <h3 style="font-size:1.1rem; margin-bottom:4px;">Get the complete valuation report</h3>
          <p class="text-secondary" style="font-size:13.5px;">Detailed per-claim analysis, comparable case citations, negotiation guidance, and a downloadable PDF.</p>
        </div>
        <button type="button" class="btn btn-primary" id="cv-get-report">Get Full Report</button>
      </div>`;
  }

  // ---------- navigation & rendering ----------
  function progressHtml(steps) {
    return `
      <div class="cv-progress-label">Step ${state.step + 1} of ${steps.length}</div>
      <div class="cv-progress">
        ${steps.map((s, i) => `<div class="cv-progress-step ${i < state.step ? "is-done" : ""} ${i === state.step ? "is-active" : ""}"></div>`).join("")}
      </div>`;
  }

  function isStepValid(stepKey, a) {
    switch (stepKey) {
      case "role_state": return !!a.role && !!a.state;
      case "lease_basics": return a.monthlyRent > 0 && a.hasWrittenLease !== null && a.leaseTerminated !== null;
      default: return true;
    }
  }

  function render() {
    const steps = stepsFor(state.answers);
    if (state.step >= steps.length) state.step = steps.length - 1;
    const step = steps[state.step];
    const isLast = state.step === steps.length - 1;
    const isResults = step.key === "results";

    root.innerHTML = `
      ${progressHtml(steps)}
      <div class="cv-card">
        ${!isResults ? `<div class="cv-step-title">${esc(step.title)}</div>` : ""}
        <div id="cv-step-body">${step.render()}</div>
        ${!isResults ? `
          <div class="cv-step-nav">
            <button type="button" class="cv-btn-back" id="cv-back" ${state.step === 0 ? "disabled style=\"visibility:hidden\"" : ""}>&larr; Back</button>
            <button type="button" class="btn btn-primary" id="cv-next">${state.step === steps.length - 2 ? "See My Estimate" : "Continue"}</button>
          </div>` : `
          <div class="cv-step-nav">
            <button type="button" class="cv-btn-back" id="cv-back">&larr; Edit answers</button>
          </div>`}
      </div>`;

    wireInputs();

    const backBtn = document.getElementById("cv-back");
    if (backBtn) backBtn.addEventListener("click", () => { state.step = Math.max(0, state.step - 1); render(); });

    const nextBtn = document.getElementById("cv-next");
    if (nextBtn) nextBtn.addEventListener("click", () => {
      if (!isStepValid(step.key, state.answers)) {
        nextBtn.textContent = "Please complete required fields";
        setTimeout(() => { nextBtn.textContent = state.step === steps.length - 2 ? "See My Estimate" : "Continue"; }, 1600);
        return;
      }
      state.step += 1;
      render();
    });

    const reportBtn = document.getElementById("cv-get-report");
    if (reportBtn) reportBtn.addEventListener("click", onGetReport);
  }

  function wireInputs() {
    root.querySelectorAll("[data-key]").forEach((el) => {
      el.addEventListener("input", (e) => { state.answers[el.getAttribute("data-key")] = e.target.value; });
      el.addEventListener("change", (e) => { state.answers[el.getAttribute("data-key")] = e.target.value; });
    });
    root.querySelectorAll("[data-choice-key]").forEach((group) => {
      const key = group.getAttribute("data-choice-key");
      group.querySelectorAll(".cv-choice-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.answers[key] = btn.getAttribute("data-value");
          // re-render just this step's body to reflect conditional fields, preserving scroll position
          const body = document.getElementById("cv-step-body");
          const steps = stepsFor(state.answers);
          body.innerHTML = steps[state.step].render();
          wireInputs();
        });
      });
    });
  }

  function onGetReport() {
    if (typeof CV_REPORT !== "undefined") {
      CV_REPORT.requestFullReport(state.result, coerce(state.answers));
    }
  }

  render();
})();
