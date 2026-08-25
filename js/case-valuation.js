/* =========================================================
   CREdocket — Litigation Value Estimator page logic
   -----------------------------------------------------------
   One combined interface: manual fact entry is free for everyone;
   document upload (which pre-fills those same fields via AI
   extraction, then adds a written analysis on top) requires
   purchased analysis credits. Both paths feed the same form fields,
   the same deterministic engine, and the same results area.

   Document text extraction happens entirely client-side (PDF via
   pdf.js, .docx via mammoth.js, .txt via FileReader) -- the raw file
   is never uploaded or stored anywhere; only the extracted text is
   sent to the case-valuation-analyze Edge Function, which already
   enforces the credit balance and rate limit server-side. Until an
   ANTHROPIC_API_KEY secret is set on that function, a real submission
   comes back as HTTP 501 "not_configured" -- that's the correct, safe
   behavior, not a bug in this file.
   ========================================================= */

(function () {
  "use strict";
  if (typeof CASE_VALUATION_DATA === "undefined" || !window.RELAW_VALUATION) return;
  const V = window.RELAW_VALUATION;
  const SPEC = CASE_VALUATION_DATA.spec.categories;
  const STATE_MODS = CASE_VALUATION_DATA.stateLawModifiers;
  const STATES = Object.keys(STATE_MODS).sort();

  // ---- CONFIG ---------------------------------------------------------
  const STRIPE_PAYMENT_LINK_URL = "https://buy.stripe.com/dRm9AL34yaOSeLJetz1B601";
  const PRICE_DISPLAY = "$49 one-time — 10 analysis credits";
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  // Same publishable key as js/supabase-client.js -- safe to ship
  // client-side by design (Supabase governs access via RLS).
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const ANALYZE_FN_URL = SUPABASE_URL + "/functions/v1/case-valuation-analyze";
  const MAX_DOC_CHARS = 50000; // keeps a real API call bounded/affordable
  // --------------------------------------------------------------------

  const sb = window.RELAW_SUPABASE;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ---------- entitlement checks ----------------------------------
     Two DIFFERENT, deliberate gates:
     - checkEntitlement(): "has ever purchased" -- unlocks the manual
       tool's full claim-by-claim breakdown + PDF export, forever, for
       zero additional marginal cost. One-time unlock, not metered.
     - getCreditBalance(): live remaining-credit count -- gates
       document upload/AI analysis specifically, since each analysis
       has a real AI API cost. Every purchase adds credits; they're
       consumed one per analysis and never expire. */
  async function checkEntitlement() {
    if (!window.RELAW_AUTH || !sb) return false;
    const session = window.RELAW_AUTH.getSession();
    if (!session) return false;
    try {
      const { data, error } = await sb
        .from("case_valuation_purchases")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (error) return false;
      return !!data;
    } catch (e) {
      return false;
    }
  }

  async function getCreditBalance() {
    const [{ data: purchases, error: pErr }, { count, error: cErr }] = await Promise.all([
      sb.from("case_valuation_purchases").select("credits_granted"),
      sb.from("case_valuation_analyses").select("id", { count: "exact", head: true })
    ]);
    if (pErr || cErr) return null;
    const total = (purchases || []).reduce((s, p) => s + (p.credits_granted || 0), 0);
    const used = count || 0;
    return { total, used, remaining: total - used };
  }

  function upsellHtml() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) {
      return `
        <div class="gate-card">
          <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
          <h3 style="margin-bottom:8px;">Sign in to see the full breakdown</h3>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">The net position above is free for everyone. The claim-by-claim analysis with citations, the cost-to-litigate comparison, and the PDF report require a free account and the full-access plan.</p>
          <button type="button" class="btn btn-primary btn-sm" id="cv-signin-btn">Sign in to continue</button>
        </div>`;
    }
    const buyBtn = STRIPE_PAYMENT_LINK_URL
      ? `<a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Unlock Full Access</a>`
      : `<a href="contact.html?matter=${encodeURIComponent("Litigation Value Estimator — full access")}" class="btn btn-primary btn-sm">Contact Us to Purchase</a>`;
    return `
      <div class="gate-card eg-purchase-card">
        <div class="eyebrow" style="margin-bottom:8px;">Full Access Required</div>
        <h3 style="margin-bottom:4px;">See the full claim-by-claim analysis</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:18px;">Unlocks the claim-by-claim breakdown with real case citations, the cost-to-litigate and settlement comparison, document upload with AI analysis, and PDF report export — for every category, every matter.</p>
        ${buyBtn}
      </div>`;
  }

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
      { key: "daysLockedOut", label: "If wrongful lockout: number of days the tenant was locked out (for per-day statutory penalty states)", type: "number" },
      { key: "selfHelpDisruptedThirdPartyContracts", label: "Did the lockout disrupt the tenant's contracts with its own customers/suppliers/employees (not just occupancy)?", type: "boolean" },
      { key: "lostProfitsFromInterference", label: "If so: tenant's lost profits claimed from that third-party contract disruption ($)", type: "number" },
      { key: "repairFailureOrInterferenceClaimed", label: "Is the tenant alleging failure to repair / interference with use?", type: "boolean" },
      { key: "gaveCureNoticeLandlordFailedToAct", label: "Did the tenant give notice and the landlord fail to act?", type: "boolean" },
      { key: "depositAmount", label: "Security deposit amount ($)", type: "number" },
      { key: "depositDisputed", label: "Is the deposit withheld/disputed?", type: "boolean" },
      { key: "landlordProvidedItemization", label: "Did the landlord provide an itemization of deductions?", type: "boolean" },
      { key: "releaseWorkCosts", label: "Costs incurred/anticipated to re-lease the space — landlord's work, tenant-improvement allowance, leasing commissions ($)", type: "number" },
      { key: "hasFeeShiftingClause", label: "Does the lease have an attorney's-fees (fee-shifting) clause?", type: "boolean" },
      { key: "litigationPosture", label: "Litigation posture (for attorney's-fees estimate)", type: "select", options: ["default", "answered-passive", "contested-msj", "trial"] }
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
      { key: "guarantorAssertsCounterclaimOrOffset", label: "Does the guarantor assert a counterclaim or offset against the guaranty?", type: "boolean" },
      { key: "lenderMisconductAlleged", label: "Does the borrower allege lender misconduct (bad faith, wrongful acceleration)?", type: "boolean" },
      { key: "egregiousConductAlleged", label: "If lender misconduct alleged: is it egregious / clear bad faith (opens exemplary damages)?", type: "boolean" },
      { key: "lenderLiabilityDamagesClaimed", label: "If lender misconduct alleged: borrower's claimed damages (contract, lost profits, out-of-pocket) ($)", type: "number" },
      { key: "hasFeeShiftingClause", label: "Does the loan/guaranty documentation have an attorney's-fees (fee-shifting) clause?", type: "boolean" },
      { key: "litigationPosture", label: "Litigation posture (for attorney's-fees estimate)", type: "select", options: ["default", "answered-passive", "contested-msj", "trial"] }
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
  const uploadHost = document.getElementById("cv-upload-host");
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
      facts.wrongfulLockoutRemedyType = m.wrongfulLockoutRemedyType;
      facts.wrongfulLockoutRemedyValue = m.wrongfulLockoutRemedyValue;
      facts.wrongfulLockoutCitation = m.wrongfulLockoutCitation;
    }
    return facts;
  }

  // Fills the currently-rendered form fields from an extractedFacts object
  // (AI extraction result) -- same data-key attributes collectFacts() reads,
  // so the user sees exactly what was extracted and can review/edit before
  // estimating. Does not touch fields extraction didn't return a value for.
  function fillFormFromFacts(facts) {
    formHost.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      const type = el.getAttribute("data-type");
      if (!(key in facts) || facts[key] === null || facts[key] === undefined) return;
      const v = facts[key];
      if (type === "boolean") el.value = v ? "true" : "false";
      else el.value = String(v);
    });
  }

  function claimResultHtml(c) {
    const evRange = c.expectedValueRange;
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${c.label}</h4>
          <span class="cv-prob">${V.pct ? V.pct(c.probability) : `${Math.round(c.probability[0] * 100)}–${Math.round(c.probability[1] * 100)}%`} likelihood</span>
        </div>
        ${c.damagesRange ? `<div class="cv-damages">Damages range: ${V.fmtRange(c.damagesRange[0], c.damagesRange[1])}</div>` : ""}
        ${evRange && !c.isBenchmark ? `<div class="cv-ev">Expected value: <strong>${V.fmtRange(evRange[0], evRange[1])}</strong></div>` : ""}
        ${c.note ? `<p class="cv-note">${c.note}</p>` : ""}
        ${(c.citations || []).length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${c.citations.map((cit) => `
          <div class="cv-citation">
            ${cit.url ? `<a href="${cit.url}" target="_blank" rel="noopener">${cit.caseName}</a>` : cit.caseName}
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${V.fmt(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  function collectCostFacts() {
    const out = {};
    document.querySelectorAll("[data-cost-key]").forEach((el) => {
      const key = el.getAttribute("data-cost-key");
      const type = el.getAttribute("data-type");
      const raw = el.value;
      if (raw === "") return;
      if (type === "boolean") out[key] = raw === "true";
      else out[key] = parseFloat(raw);
    });
    return out;
  }

  function costCardHtml(costEstimate, netAfterCosts, comparison) {
    let verdictHtml = "";
    if (comparison) {
      let verdictClass = "cv-verdict-mixed", verdictText;
      if (comparison.clearlyFavorsLitigating) {
        verdictClass = "cv-verdict-litigate";
        verdictText = `Litigating clears the ${V.fmt(comparison.settlementOnTable)} settlement on the table even in the worst-case scenario.`;
      } else if (comparison.clearlyFavorsSettling) {
        verdictClass = "cv-verdict-settle";
        verdictText = `The ${V.fmt(comparison.settlementOnTable)} settlement on the table beats litigating even in the best-case scenario.`;
      } else {
        verdictText = `Depends on where the actual outcome lands within the range — litigating could net more or less than the ${V.fmt(comparison.settlementOnTable)} settlement on the table.`;
      }
      verdictHtml = `<div class="cv-verdict ${verdictClass}">${verdictText}</div>`;
    }
    return `
      <div class="cv-summary card" style="margin-top:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">Cost to Litigate</div>
        <p class="text-secondary" style="font-size:13px; margin-bottom:4px;">Estimated attorney fees (${costEstimate.pathLabel}): <strong>${V.fmtRange(costEstimate.costRange[0], costEstimate.costRange[1])}</strong></p>
        <p class="text-secondary" style="font-size:13px; margin-bottom:16px;">Estimated time to resolution: <strong>${costEstimate.monthsRange[0]}–${costEstimate.monthsRange[1]} months</strong></p>
        <div class="eyebrow" style="margin-bottom:8px;">Net Position After Litigation Costs</div>
        <div class="cv-net">${V.fmtRange(netAfterCosts[0], netAfterCosts[1])}</div>
        <p class="text-muted" style="font-size:12px; margin-bottom:${verdictHtml ? "12" : "0"}px;">${costEstimate.isCustom ? "Using your own attorney-fee estimate." : "Using general industry cost norms for this category — not individually cited to a real case."} This does not include expert-witness costs, court costs, or the value of management time diverted to the matter.</p>
        ${verdictHtml}
      </div>`;
  }

  form.addEventListener("submit", async (e) => {
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
        <p class="text-muted" style="font-size:12.5px;">Sum of applicable claims' expected values, from the ${side === "sideA" ? roles.sideA : roles.sideB}'s perspective. This is a probability-informed estimate, not a prediction of any specific outcome.</p>
      </div>
      <div id="cv-gated-content" style="margin-top:16px;"><div class="gate-card is-loading">Checking access…</div></div>
    `;

    const gatedSlot = document.getElementById("cv-gated-content");
    const entitled = await checkEntitlement();

    if (!entitled) {
      gatedSlot.innerHTML = upsellHtml();
      const signInBtn = document.getElementById("cv-signin-btn");
      if (signInBtn && window.RELAW_AUTH) signInBtn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
      return;
    }

    let costHtml = "";
    let costData = null;
    if (window.RELAW_VALUATION_COSTS) {
      const costFacts = collectCostFacts();
      const costEstimate = window.RELAW_VALUATION_COSTS.estimateCost(slug, costFacts);
      const { netAfterCosts, comparison } = window.RELAW_VALUATION_COSTS.compareToSettlement(net, costEstimate, costFacts.settlementOnTable);
      costHtml = costCardHtml(costEstimate, netAfterCosts, comparison);
      costData = { costEstimate, netAfterCosts, comparison };
    }

    gatedSlot.innerHTML = `
      <div class="card" style="padding:20px;">
        <button type="button" class="btn btn-ghost btn-sm" id="cv-download-report">
          Download PDF Report
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${costHtml}
      <div class="cv-claims" style="margin-top:16px;">${evalResult.claims.map(claimResultHtml).join("")}</div>
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
            catSpec: SPEC[slug],
            costData
          });
        }
      });
    }
  });

  /* =========================================================
     Document upload / AI analysis -- gated to users with remaining
     analysis credits. Extracts text client-side, sends it to the
     Edge Function (which enforces credits + rate limit server-side
     regardless of what this UI shows), then uses the response to
     (a) pre-fill the form fields above so they're reviewable/editable
     and (b) render the full result -- net position, claim-by-claim
     breakdown with citations, and the AI-written narrative -- into
     the same results area the manual "Estimate" button uses.
     ========================================================= */

  async function extractPdfText(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
    }
    return text.trim();
  }

  async function extractDocxText(file) {
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }

  async function extractText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "txt") return (await file.text()).trim();
    if (ext === "pdf") return await extractPdfText(file);
    if (ext === "docx") return await extractDocxText(file);
    throw new Error("Unsupported file type — upload a PDF, .docx, or .txt file, or paste the text directly below.");
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to upload documents</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Document upload runs on purchased analysis credits tied to your account. You can still answer the questions below by hand for free without signing in.</p>
        <button type="button" class="btn btn-primary btn-sm" id="cv-ai-signin-btn">Sign in to continue</button>
      </div>`;
  }

  function noCreditsCardHtml(bal) {
    const usedNote = bal && bal.total > 0
      ? `<p class="text-muted" style="font-size:12px; margin-bottom:16px;">You've used ${bal.used} of ${bal.total} purchased credits.</p>`
      : "";
    return `
      <div class="gate-card eg-purchase-card">
        <div class="eyebrow" style="margin-bottom:8px;">Analysis Credits Required</div>
        <h3 style="margin-bottom:4px;">Upload documents for AI-assisted analysis</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:12px;">Each credit analyzes one matter's documents and unlocks the full manual breakdown too. Credits never expire and stack across purchases. You can still answer the questions below by hand for free.</p>
        ${usedNote}
        <a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Purchase Credits</a>
      </div>`;
  }

  function uploadZoneHtml(bal) {
    return `
      <div class="card cv-upload-card" style="padding:20px; margin-bottom:20px;">
        <div class="cv-ai-balance">
          <span class="badge badge-live">${bal.remaining} of ${bal.total} analysis credits remaining</span>
        </div>
        <p class="text-secondary" style="font-size:13px; line-height:1.6; margin:10px 0 14px;">Upload the original petition, an answer, a counterclaim — as many documents as you have. Extracted facts fill in the questions below for you to review, plus you get a written analysis. Nothing you upload is stored — only the extracted text is sent for analysis.</p>
        <div class="cv-ai-dropzone" id="cv-ai-dropzone">
          <input type="file" id="cv-ai-file" accept=".pdf,.docx,.txt" multiple style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop pleadings here</strong> or <button type="button" class="text-accent" id="cv-ai-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse files</button></p>
            <p class="text-muted" style="font-size:12px;">PDF, .docx, or .txt</p>
          </div>
          <div class="cv-ai-filelist" id="cv-ai-filelist"></div>
        </div>
        <div class="cv-field">
          <label for="cv-ai-pastetext">Or paste text directly (optional, adds to any files above)</label>
          <textarea id="cv-ai-pastetext" rows="3" placeholder="Paste document text here…"></textarea>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="cv-ai-analyze-btn">
          Analyze Documents
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div id="cv-ai-status" class="cv-ai-status"></div>
      </div>`;
  }

  function renderFileList(container, files) {
    if (!files.length) { container.innerHTML = ""; return; }
    container.innerHTML = files.map((f, i) => `
      <span class="cv-ai-file-chip">${f.name}<button type="button" class="cv-ai-file-remove" data-idx="${i}" aria-label="Remove ${f.name}">&times;</button></span>
    `).join("");
  }

  // Renders the full AI-analysis result (net position, narrative, extracted
  // facts, claim-by-claim breakdown) into the shared results area, and
  // pre-fills the shared form fields so the user can review/tweak them.
  // An AI-identified issue isn't the same shape as a baseline-engine claim
  // (it has freeform analysis text and an optional, not-always-present
  // probability/damages range, since not every issue reduces to a dollar
  // figure) -- its own card, visually consistent with claimResultHtml.
  function issueResultHtml(iss) {
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${iss.label}</h4>
          ${iss.probabilityRange ? `<span class="cv-prob">${Math.round(iss.probabilityRange[0] * 100)}–${Math.round(iss.probabilityRange[1] * 100)}% likelihood</span>` : ""}
        </div>
        ${iss.damagesRange ? `<div class="cv-damages">Value range: ${V.fmtRange(iss.damagesRange[0], iss.damagesRange[1])}</div>` : ""}
        ${iss.analysis ? `<p class="cv-note">${iss.analysis}</p>` : ""}
        ${(iss.citations || []).length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${iss.citations.map((cit) => `
          <div class="cv-citation">
            ${cit.url ? `<a href="${cit.url}" target="_blank" rel="noopener">${cit.caseName}</a>` : cit.caseName}
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${V.fmt(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  function renderAiResult(json, slug) {
    const a = json.analysis || {};
    const facts = json.extractedFacts || {};
    const baseline = a.baseline || {};

    if (facts && Object.keys(facts).length) fillFormFromFacts(facts);
    if (facts && (facts.filingParty === "sideA" || facts.filingParty === "sideB") && !sideSelect.dataset.userChosen) {
      sideSelect.value = facts.filingParty;
    }

    const factEntries = Object.entries(facts).filter(([k, v]) => k !== "filingParty" && v !== null && v !== undefined && v !== "");
    const factsHtml = factEntries.length
      ? `<div class="cv-ai-facts"><div class="cv-citations-label">Facts extracted from your documents (review above, then re-run Estimate anytime to test edits):</div>${factEntries.map(([k, v]) => `<span class="detail-tag">${k}: ${v}</span>`).join("")}</div>`
      : "";
    const issuesHtml = (a.issues || []).length
      ? `<div class="cv-claims" style="margin-top:16px;">${a.issues.map(issueResultHtml).join("")}</div>`
      : "";
    const baselineClaimsHtml = (baseline.claims || []).length
      ? `<div class="cv-claims" style="margin-top:12px;">${baseline.claims.map(claimResultHtml).join("")}</div>`
      : `<p class="text-muted" style="font-size:12.5px;">The fixed-formula baseline model found no matching claims from the extracted checkbox-style facts — the AI's own analysis above reads the actual document, not just this baseline.</p>`;

    resultsHost.innerHTML = `
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">AI Analysis — Probability-Weighted Prediction${a.roleLabel ? ` — ${a.roleLabel} view` : ""}</div>
        ${a.damagesRange ? `<div class="cv-net">${V.fmtRange(a.damagesRange[0], a.damagesRange[1])}</div>` : ""}
        ${a.likelyOutcome ? `<p class="text-secondary" style="font-size:13.5px; margin-top:8px;">${a.likelyOutcome}</p>` : ""}
      </div>
      ${a.narrative ? `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:8px;">Comprehensive Analysis</div><p class="cv-note" style="font-size:13.5px; line-height:1.7;">${a.narrative}</p></div>` : ""}
      <div id="cv-gated-content" style="margin-top:16px;">
        <div class="card" style="padding:20px;">
          <button type="button" class="btn btn-ghost btn-sm" id="cv-download-report">
            Download PDF Report
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        ${factsHtml}
        ${issuesHtml}
      </div>
      <div class="card" style="padding:20px; margin-top:16px; border-style:dashed;">
        <div class="eyebrow" style="margin-bottom:8px;">Baseline Model Estimate (reference only)</div>
        <p class="text-muted" style="font-size:12px; line-height:1.6; margin-bottom:10px;">The same fixed-formula engine the manual form uses, run on the facts extracted from your documents — a mechanical cross-check, not the AI's conclusion. ${baseline.damagesRange ? `Baseline net position: <strong>${V.fmtRange(baseline.damagesRange[0], baseline.damagesRange[1])}</strong>.` : ""}</p>
        ${baselineClaimsHtml}
      </div>
      <p class="text-muted" style="font-size:12px; margin-top:14px;">This is a probability-weighted prediction generated from the documents you provided, not a legal opinion, adjudication, or substitute for counsel.</p>`;

    const downloadBtn = document.getElementById("cv-download-report");
    if (downloadBtn && window.CV_REPORT) {
      downloadBtn.addEventListener("click", () => {
        window.CV_REPORT.requestFullReport({ claims: (a.issues || []).map((iss) => ({
          claimKey: iss.label, label: iss.label,
          probability: iss.probabilityRange || [0, 0],
          damagesRange: iss.damagesRange || null,
          expectedValueRange: iss.damagesRange && iss.probabilityRange
            ? [iss.damagesRange[0] * iss.probabilityRange[0], iss.damagesRange[1] * iss.probabilityRange[1]] : null,
          note: iss.analysis, isBenchmark: false, citations: iss.citations || [],
        })) }, {
          categoryLabel: a.categoryLabel,
          roles: SPEC[slug] ? SPEC[slug].roles : null,
          side: facts.filingParty || sideSelect.value,
          net: a.damagesRange || [0, 0],
          catSpec: SPEC[slug],
          costData: null
        });
      });
    }
  }

  function wireUploadZone(bal) {
    const dropzone = document.getElementById("cv-ai-dropzone");
    const fileInput = document.getElementById("cv-ai-file");
    const browseBtn = document.getElementById("cv-ai-browse-btn");
    const filelistEl = document.getElementById("cv-ai-filelist");
    const pasteEl = document.getElementById("cv-ai-pastetext");
    const statusEl = document.getElementById("cv-ai-status");
    const analyzeBtn = document.getElementById("cv-ai-analyze-btn");

    let chosenFiles = [];

    sideSelect.addEventListener("change", () => { sideSelect.dataset.userChosen = "1"; });

    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      chosenFiles = chosenFiles.concat(Array.from(fileInput.files || []));
      fileInput.value = "";
      renderFileList(filelistEl, chosenFiles);
    });
    ["dragover", "dragenter"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
    );
    ["dragleave", "dragend", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const dropped = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (dropped.length) {
        chosenFiles = chosenFiles.concat(dropped);
        renderFileList(filelistEl, chosenFiles);
      }
    });
    filelistEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cv-ai-file-remove");
      if (!btn) return;
      chosenFiles.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
      renderFileList(filelistEl, chosenFiles);
    });

    analyzeBtn.addEventListener("click", async () => {
      const slug = catSelect.value;
      if (!slug) { statusEl.textContent = "Select a litigation category first."; statusEl.className = "cv-ai-status is-error"; return; }
      if (!chosenFiles.length && !pasteEl.value.trim()) { statusEl.textContent = "Upload at least one file or paste the document text first."; statusEl.className = "cv-ai-status is-error"; return; }

      analyzeBtn.disabled = true;
      resultsHost.innerHTML = "";
      try {
        const sections = [];
        for (let i = 0; i < chosenFiles.length; i++) {
          const f = chosenFiles[i];
          statusEl.textContent = `Extracting text (${i + 1} of ${chosenFiles.length}: ${f.name})…`;
          statusEl.className = "cv-ai-status";
          const text = await extractText(f);
          if (text) sections.push(`=== Document ${i + 1}: ${f.name} ===\n${text}`);
        }
        if (pasteEl.value.trim()) {
          sections.push(chosenFiles.length ? `=== Additional context ===\n${pasteEl.value.trim()}` : pasteEl.value.trim());
        }
        let documentText = sections.join("\n\n");
        if (!documentText) throw new Error("No text could be extracted — try pasting the text directly instead.");
        if (documentText.length > MAX_DOC_CHARS) {
          documentText = documentText.slice(0, MAX_DOC_CHARS);
          statusEl.textContent = `Combined document text truncated to the first ${MAX_DOC_CHARS.toLocaleString()} characters for analysis…`;
        } else {
          statusEl.textContent = "Analyzing…";
        }

        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("Your session expired — sign in again and retry.");

        const costFacts = collectCostFacts();
        const resp = await fetch(ANALYZE_FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": SUPABASE_PUBLISHABLE_KEY
          },
          body: JSON.stringify({
            documentText,
            category: slug,
            userSide: sideSelect.dataset.userChosen ? sideSelect.value : null,
            expectToTrial: !!costFacts.expectToTrial,
            settlementOnTable: costFacts.settlementOnTable || null
          })
        });
        const json = await resp.json().catch(() => ({}));

        if (resp.ok) {
          statusEl.textContent = "";
          renderAiResult(json, slug);
          return;
        }

        statusEl.textContent = "";
        if (resp.status === 402) {
          resultsHost.innerHTML = noCreditsCardHtml({ total: bal.total, used: bal.total });
        } else if (resp.status === 429) {
          resultsHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${json.error || "You've hit today's request limit — try again tomorrow."}</p></div>`;
        } else if (resp.status === 501) {
          resultsHost.innerHTML = `<div class="gate-card"><div class="eyebrow" style="margin-bottom:8px;">Coming Soon</div><p class="text-secondary" style="font-size:13.5px;">AI document analysis is being finalized on our end — the upload and access checks are fully live, but the analysis engine itself isn't switched on yet. Check back soon, and your credit was <strong>not</strong> used for this attempt.</p></div>`;
        } else if (resp.status === 401) {
          resultsHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Your session expired — refresh the page and sign in again.</p></div>`;
        } else {
          resultsHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${(json && json.error) || "Something went wrong — try again."}</p></div>`;
        }
      } catch (err) {
        statusEl.textContent = "";
        resultsHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${err.message || "Something went wrong — try again."}</p></div>`;
      } finally {
        analyzeBtn.disabled = false;
        renderUploadZone();
      }
    });
  }

  async function renderUploadZone() {
    if (!uploadHost || !sb) return;
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) {
      uploadHost.innerHTML = signInCardHtml();
      const btn = document.getElementById("cv-ai-signin-btn");
      if (btn && window.RELAW_AUTH) btn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
      return;
    }
    uploadHost.innerHTML = `<div class="gate-card is-loading">Checking your credit balance…</div>`;
    const bal = await getCreditBalance();
    if (!bal) {
      uploadHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Couldn't check your credit balance — refresh and try again.</p></div>`;
      return;
    }
    if (bal.remaining <= 0) {
      uploadHost.innerHTML = noCreditsCardHtml(bal);
      return;
    }
    uploadHost.innerHTML = uploadZoneHtml(bal);
    wireUploadZone(bal);
  }

  if (sb) {
    sb.auth.getSession().then(() => renderUploadZone());
    sb.auth.onAuthStateChange(() => renderUploadZone());
  }
})();
