/* =========================================================
   CREdocket — Litigation Value Estimator engine
   A structured, rules-based expected-value model — probability
   range × damages range, never a single point estimate — calibrated
   against real cited case outcomes and (where relevant) state law.
   Not a black-box prediction, and not legal advice: every result
   traces to a specific rule and/or a real cited comparable case.
   ========================================================= */

(function () {
  "use strict";
  if (typeof CASE_VALUATION_DATA === "undefined") return;

  const SPEC = CASE_VALUATION_DATA.spec.categories;
  const CITATIONS = CASE_VALUATION_DATA.citations;
  const fmt = (n) => (n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US"));
  const fmtRange = (lo, hi) => (Math.round(lo) === Math.round(hi) ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`);
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const pct = (r) => `${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%`;

  // Present value of a level (non-escalating) monthly payment stream --
  // standard ordinary-annuity PV formula. `totalUndiscounted` is the sum of
  // all payments over `months`; converted to an implied level monthly
  // payment internally. Used for accelerated-rent damages, which must be
  // discounted to present value under case law once future rent is
  // accelerated (see the cited case).
  function pvOfLevelStream(totalUndiscounted, months, annualRate) {
    if (!months || totalUndiscounted <= 0) return 0;
    const monthlyAmt = totalUndiscounted / months;
    const r = annualRate / 12;
    if (r === 0) return totalUndiscounted;
    return monthlyAmt * (1 - Math.pow(1 + r, -months)) / r;
  }

  function result(claimKey, label, probRange, damagesLow, damagesHigh, note, isBenchmark) {
    return {
      claimKey,
      label,
      probability: probRange,
      damagesRange: damagesLow != null ? [damagesLow, damagesHigh] : null,
      expectedValueRange: damagesLow != null ? [probRange[0] * damagesLow, probRange[1] * damagesHigh] : null,
      note: note || "",
      isBenchmark: !!isBenchmark,
      citations: CITATIONS[claimKey] || []
    };
  }

  /* ---------- lease-disputes ---------- */
  function evalLeaseDisputes(facts) {
    const out = [];
    if (facts.unpaidRentAmount > 0) {
      let p = [0.90, 0.97];
      if (facts.tenantDisputesDebt) p = [0.55, 0.75];
      else if (facts.hasWrittenLease === false) p = [0.40, 0.60];
      out.push(result("unpaid_rent", "Unpaid Rent", p, facts.unpaidRentAmount, facts.unpaidRentAmount));
    }
    if (facts.leaseTerminated && facts.remainingMonths > 0 && facts.monthlyRent > 0) {
      let p = facts.hasAccelerationClause === "yes" ? [0.65, 0.90] : [0.15, 0.30];
      const grossFutureRent = facts.remainingMonths * facts.monthlyRent;
      // Net of actual/anticipated replacement-tenant rent (dollar-for-dollar,
      // BEFORE discounting -- this is the order real accelerated-rent damages
      // methodology uses) if re-let; otherwise a modest haircut reflecting the
      // uncertainty of a still-unfulfilled mitigation duty, not a guess at the
      // eventual relet amount itself.
      let netLow = grossFutureRent, netHigh = grossFutureRent;
      if (facts.hasRelet && facts.reletRentAmount >= 0) {
        netLow = netHigh = Math.max(0, grossFutureRent - facts.reletRentAmount);
      } else if (facts.mitigationDuty === "Yes") {
        netLow = grossFutureRent * 0.80; netHigh = grossFutureRent * 0.98;
      } else if (facts.mitigationDuty === "Unclear") {
        netLow = grossFutureRent * 0.88; netHigh = grossFutureRent;
      }
      // Present-value discount (5%-9% annual, not a flat percentage-of-gross
      // haircut) -- required by case law once future rent is accelerated;
      // see the cited case, which used a 6.0% rate reflecting the anticipated
      // creditworthiness of a replacement tenant.
      const low = pvOfLevelStream(netLow, facts.remainingMonths, 0.09);
      const high = pvOfLevelStream(netHigh, facts.remainingMonths, 0.05);
      out.push(result("accelerated_rent", "Accelerated / Future Rent", p, Math.max(0, low), Math.max(0, high),
        "Discounted to present value using a 5%–9% annual rate range (industry/court practice, not a flat percentage haircut)." +
        (facts.hasRelet ? " Net of actual/anticipated replacement-tenant rent." : "")));
    }
    if (facts.releaseWorkCosts > 0) {
      out.push(result("releasing_mitigation_costs", "Re-Leasing / Mitigation Costs", [0.60, 0.85],
        facts.releaseWorkCosts * 0.85, facts.releaseWorkCosts,
        "Landlord's work, tenant-improvement allowances, and leasing commissions incurred to re-lease the space — usually actual, invoiced costs, so recovery tends to run close to the amount claimed."));
    }
    if (facts.heldOverAfterTerm && facts.holdoverStatutoryPenalty && facts.monthlyRent > 0 && facts.holdoverMonths > 0) {
      out.push(result("holdover_damages", "Statutory Holdover Damages", [0.80, 0.95],
        facts.monthlyRent * 2 * facts.holdoverMonths, facts.monthlyRent * 3 * facts.holdoverMonths,
        "Uses a 2x–3x statutory multiplier range as a placeholder — the exact multiplier is state-specific and should be confirmed against that state's chapter."));
    }
    if (facts.propertyDamageAmount > 0) {
      out.push(result("property_damage", "Property Damage / Repairs", [0.70, 0.90],
        facts.propertyDamageAmount * 0.80, facts.propertyDamageAmount * 0.90,
        "Reduced for a typical 10–20% normal-wear-and-tear haircut."));
    }
    if (facts.selfHelpUsed) {
      let p;
      const sh = facts.selfHelpAvailable;
      if (sh === "Not Available") p = [0.85, 0.95];
      else if ((sh === "Available" || sh === "Conditional") && facts.selfHelpProcessFollowed === "yes") p = [0.10, 0.25];
      else if (sh === "Conditional" && facts.selfHelpProcessFollowed === "no") p = [0.60, 0.80];
      else p = [0.30, 0.60];
      if (facts.wrongfulLockoutDamages > 0) {
        out.push(result("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p,
          facts.wrongfulLockoutDamages, facts.wrongfulLockoutDamages * (facts.holdoverStatutoryPenalty ? 2 : 1.3),
          "High end assumes a state statutory penalty multiplier applies — confirm against that state's chapter."));
      } else {
        out.push(result("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p, null, null,
          "No damages amount entered — probability shown reflects state self-help law and whether statutory process was followed."));
      }
    }
    if (facts.repairFailureOrInterferenceClaimed) {
      let p = [0.40, 0.65];
      if (facts.gaveCureNoticeLandlordFailedToAct) p = [0.50, 0.80];
      out.push(result("quiet_enjoyment_breach", "Breach of Quiet Enjoyment / Constructive Eviction", p, null, null,
        "Fact-intensive claim, informed by comparable cases rather than a formula — see cited cases."));
    }
    if (facts.depositAmount > 0 && facts.depositDisputed) {
      let p = [0.55, 0.80];
      if (!facts.landlordProvidedItemization) p = [0.65, 0.90];
      out.push(result("security_deposit", "Wrongfully Withheld Security Deposit", p, facts.depositAmount, facts.depositAmount,
        "Most states have no commercial-specific deposit statute — this is usually a straight lease-terms question, not a statutory one."));
    }
    if (facts.hasFeeShiftingClause && out.length) {
      const avgP = out.reduce((s, c) => s + (c.probability[0] + c.probability[1]) / 2, 0) / out.length;
      const principalLow = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[0] : 0), 0);
      const principalHigh = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[1] : 0), 0);
      // Fees scale sub-linearly with claim size: litigating a small claim
      // still costs a similar baseline in hours, while a large claim's fees
      // don't grow proportionally with the dollars at stake -- a flat 15–40%
      // badly overstates fees on large commercial claims (a real ~$4.19M
      // accelerated-rent claim saw fees+costs run only ~1.3% of damages —
      // see cited case).
      const avgPrincipal = (principalLow + principalHigh) / 2;
      let feeLowPct, feeHighPct;
      if (avgPrincipal < 100000) { feeLowPct = 0.20; feeHighPct = 0.40; }
      else if (avgPrincipal < 1000000) { feeLowPct = 0.08; feeHighPct = 0.20; }
      else { feeLowPct = 0.01; feeHighPct = 0.06; }
      out.push(result("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
        principalLow * feeLowPct, principalHigh * feeHighPct,
        `Ratio-of-principal heuristic (${Math.round(feeLowPct * 100)}–${Math.round(feeHighPct * 100)}% of the other claims' damages for this claim-size tier — large claims see a much smaller fee percentage than small ones) — refine against comparable-case fee awards.`));
    }
    return out;
  }

  /* ---------- lending-foreclosure ---------- */
  function evalLendingForeclosure(facts) {
    const out = [];
    if (facts.loanBalance > 0 && facts.foreclosureFiled) {
      let p = facts.borrowerDisputesDefault ? [0.60, 0.80] : [0.85, 0.97];
      const advances = facts.lenderAdvances || 0;
      const proceeds = facts.saleProceeds || 0;
      const gross = facts.loanBalance + advances;
      out.push(result("foreclosure_deficiency_judgment", "Foreclosure / Deficiency Judgment", p,
        Math.max(0, gross - proceeds), Math.max(0, gross - proceeds * 0.5),
        "Recovery against the judgment varies enormously by asset quality — real sample ranged from ~0% to ~100% of claimed debt."));
    }
    if (facts.receivershipMotionFiled) {
      out.push(result("receivership_dispute", "Receivership Grant/Denial", [0.65, 0.85], null, null,
        "Not a dollar claim — operational-control relief. 5 of 6 sampled real matters resulted in a receiver appointed."));
    }
    if (facts.guarantyTriggerAlleged && facts.guaranteedBalance > 0) {
      out.push(result("guaranty_enforcement", "Guaranty Enforcement", [0.70, 0.92],
        facts.guaranteedBalance * 0.85, facts.guaranteedBalance,
        "Once a carve-out trigger is credibly found, sampled real cases show guarantors held fully liable even for technical/non-fraud breaches. The harder question — proving the trigger occurred — isn't modeled as a separate probability here."));
    }
    if (facts.lenderMisconductAlleged) {
      out.push(result("lender_liability_claim", "Lender Liability (borrower-asserted)", [0.15, 0.35], null, null,
        "Historically borrower-unfriendly absent clear bad faith; recent real cases trend toward procedural wins rather than dollar outcomes."));
    }
    return out;
  }

  /* ---------- reit-securities ---------- */
  function evalReitSecurities(facts) {
    const out = [];
    if (facts.stockDropAlleged && facts.estimatedInvestorLosses > 0) {
      const tier = facts.hasCriminalConductOrAuditorOrControllingShareholder;
      const pctRange = tier ? [0.10, 0.25] : [0.03, 0.08];
      out.push(result("securities_fraud_10b5", "Securities Fraud (Rule 10b-5)", [0.35, 0.55],
        facts.estimatedInvestorLosses * pctRange[0], facts.estimatedInvestorLosses * pctRange[1],
        tier ? "Criminal conduct / auditor / controlling-shareholder self-dealing present — settlements run an order of magnitude higher than a clean case." : "Clean stock-drop fact pattern — typical range is 3–8% of estimated investor losses."));
    }
    if (facts.boardBreachAlleged) {
      const specific = facts.tiedToConcreteSelfDealingTransaction;
      const p = specific ? [0.55, 0.80] : [0.05, 0.15];
      out.push(result("breach_fiduciary_duty_derivative", "Breach of Fiduciary Duty (Derivative)", p, null, null,
        specific ? "Tied to a concrete, quantifiable self-dealing transaction — real recoveries in this pattern ran $15M–$90M." : "Generic governance complaint with no specific self-dealing transaction — real cases in this pattern settled for governance changes only, with no disclosed cash recovery."));
    }
    if (facts.proxyOmissionAlleged) {
      const specific = facts.specificInsiderStakeAlleged;
      const p = specific ? [0.55, 0.80] : [0.10, 0.25];
      out.push(result("proxy_disclosure_claim", "Proxy Disclosure Claim", p, null, null,
        specific ? "A specific, quantifiable undisclosed insider stake was alleged — this pattern survived dismissal and drew real cash settlements in the research sample." : "Only a generic, already-disclosed industry risk is alleged — this pattern was dismissed for lack of materiality in the research sample."));
    }
    if (facts.mergerObjection) {
      out.push(result("merger_objection_suit", "Merger Objection Suit", [0.10, 0.25], 75000, 500000,
        "Real recovery is rare; when a settlement happens it's typically a 'mootness fee' to plaintiff's counsel, not a per-share shareholder payout."));
    }
    return out;
  }

  /* ---------- construction-defect ---------- */
  function evalConstructionDefect(facts) {
    const out = [];
    if (facts.contractorDefectAlleged && facts.repairCostEstimate > 0) {
      const catastrophic = facts.catastrophicOrLifeSafety;
      out.push(result("contractor_breach_negligence", "Contractor Breach / Negligence",
        [catastrophic ? 0.70 : 0.55, catastrophic ? 0.90 : 0.80],
        facts.repairCostEstimate * 0.85, facts.repairCostEstimate * 0.95,
        catastrophic ? "Catastrophic/life-safety failures anchor the top of the real-case range ($39M–$997M in the research sample)." : "Post-occupancy latent defects clustered $10M–$116M in the research sample; defect pervasiveness across units mattered more than unit count."));
    }
    if (facts.designErrorAlleged && facts.repairCostEstimate > 0) {
      out.push(result("design_professional_malpractice", "Design Professional Malpractice", [0.35, 0.60],
        facts.repairCostEstimate * 0.6, facts.repairCostEstimate * 0.9,
        "Harder to prove than a workmanship defect — expert-testimony-dependent standard-of-care question."));
    }
    if (facts.multiplePartiesIndemnityExists && facts.repairCostEstimate > 0) {
      out.push(result("indemnification_contribution_claim", "Indemnification / Contribution", [0.40, 0.70],
        facts.repairCostEstimate * 0.10, facts.repairCostEstimate * 0.88,
        "Real allocation example: an 88%/10%/2% subcontractor/GC/owner split when the defect traced to specific subcontractor workmanship."));
    }
    if (facts.insurerDeniedCoverage) {
      out.push(result("insurance_coverage_defect_dispute", "Insurance Coverage Dispute (CGL)", [0.45, 0.65], null, null,
        "Coverage disputes usually resolve the legal question (duty to defend/indemnify) rather than a dollar figure — treat this as a coverage yes/no signal."));
    }
    return out;
  }

  /* ---------- environmental ---------- */
  function evalEnvironmental(facts) {
    const out = [];
    if (facts.cleanupCostsIncurred > 0) {
      const tier = facts.contaminationScale;
      let low = facts.cleanupCostsIncurred * 0.5, high = facts.cleanupCostsIncurred;
      out.push(result("cercla_cost_recovery", "CERCLA Cost Recovery", [0.65, 0.85], low, high,
        "Liability is strict/joint/several once PRP status attaches — allocation share is the real question, not whether liability exists at all. Real benchmark tiers: multi-decade waterway/legacy sites $130M–$670M; single-parcel soil-only $3M–$19M; small commercial state-penalty actions $85K–$120K."));
    }
    if (facts.multiplePRPs && facts.cleanupCostsIncurred > 0) {
      out.push(result("cercla_contribution_claim", "CERCLA Contribution (PRP vs. PRP)", [0.55, 0.80],
        facts.cleanupCostsIncurred * 0.20, facts.cleanupCostsIncurred * 0.60,
        "Courts apply equitable factors that typically REDUCE a mechanically-calculated share, and an unrecoverable 'orphan share' for defunct/judgment-proof historical operators is common."));
    }
    if (facts.stateConsentDecree) {
      out.push(result("state_cleanup_consent_decree", "State Cleanup Order / Consent Decree", [1, 1], null, null,
        "Benchmark only, not an adversarial probability — nearly all consent decrees are negotiated. See real benchmark tiers above under CERCLA Cost Recovery.", true));
    }
    if (facts.insurerDeniedEnvCoverage) {
      out.push(result("environmental_insurance_coverage_dispute", "Environmental Insurance Coverage Dispute", [0.25, 0.45], null, null,
        "Sample skewed toward insurers winning on pollution-exclusion grounds. Outcome is usually binary (coverage owed / not owed), not a dollar figure."));
    }
    return out;
  }

  /* ---------- eminent-domain ---------- */
  function evalEminentDomain(facts) {
    const out = [];
    if (facts.initialOffer > 0) {
      const severance = facts.severanceOrBusinessValueDispute;
      const [loMult, hiMult] = severance ? [2.0, 5.0] : [0.5, 1.0];
      out.push(result("just_compensation_valuation", "Just Compensation Valuation", [1, 1],
        facts.initialOffer * (1 + loMult), facts.initialOffer * (1 + hiMult),
        severance
          ? "Severance/access/business-value disputes ran 2x–5x+ above the initial offer in the research sample (one case ~49x)."
          : "Routine comparable-sales-driven disputes ran ~50–100% above the initial offer in the research sample. Probability is shown as 100% because the property is being taken either way — the uncertainty here is in the VALUATION, not whether compensation is owed, so the full estimated award counts toward net position."));
    }
    if (facts.challengingTheTaking) {
      out.push(result("quick_take_challenge", "Quick-Take / Public-Use Challenge", [0.05, 0.15], null, null,
        "Courts are highly deferential to public-use determinations post-Kelo — this rarely blocks a taking outright."));
    }
    if (facts.opposingSurveyAccess) {
      out.push(result("pre_condemnation_access_dispute", "Pre-Condemnation Survey/Access Dispute", [0.05, 0.20], null, null,
        "Courts consistently allowed survey access once the entity showed a plausible path to eminent-domain authority."));
    }
    if (facts.regulatoryTakingAlleged) {
      out.push(result("regulatory_taking", "Regulatory Taking (Penn Central/Lucas)", [0.10, 0.25],
        facts.propertyFairMarketValue > 0 ? facts.propertyFairMarketValue * 0.9 : null,
        facts.propertyFairMarketValue > 0 ? facts.propertyFairMarketValue : null,
        "Rarely succeeds absent a near-total wipeout of economic value; when it does, damages tend toward full pre-regulation value."));
    }
    return out;
  }

  /* ---------- zoning-land-use ---------- */
  function evalZoningLandUse(facts) {
    const out = [];
    if (facts.varianceOrPermitDenied) {
      out.push(result("variance_permit_denial_appeal", "Variance / Permit Denial Appeal", [0.25, 0.45], null, null,
        "Zoning boards get significant judicial deference; reversal requires a clear legal or procedural error."));
    }
    if (facts.spotZoningAlleged) {
      out.push(result("spot_zoning_challenge", "Spot Zoning Challenge", [0.30, 0.50], null, null,
        "Small research sample skewed favorably (3 of 3 succeeded) — treat cautiously as possibly outcome-selection-biased."));
    }
    if (facts.arbitraryOrDiscriminatoryDenialAlleged) {
      let p = [0.10, 0.20];
      if (facts.vestedRightPlusBadFaith) p = [0.45, 0.70];
      else if (facts.longPatternShiftingDemands) p = [0.35, 0.55];
      else if (facts.noNoticeOrHearing) p = [0.40, 0.60];
      else if (facts.discriminatoryIntentEvidence) p = [0.30, 0.50];
      const lossLow = facts.lostValueEstimate > 0 ? facts.lostValueEstimate * 0.7 : null;
      const lossHigh = facts.lostValueEstimate > 0 ? facts.lostValueEstimate : null;
      out.push(result("section_1983_zoning_claim", "Section 1983 Civil Rights Claim", p, lossLow, lossHigh,
        "Ordinary administrative error is not enough — only 2 of 8 sampled real cases produced a disclosed recovery. Mandatory fee-shifting under 42 U.S.C. § 1988 stacks on top of a merits win."));
    }
    if (facts.developmentAgreementBreached && facts.lostValueEstimate > 0) {
      out.push(result("development_agreement_breach", "Development Agreement Breach", [0.45, 0.70],
        facts.lostValueEstimate * 0.6, facts.lostValueEstimate,
        "Small, success-skewed research sample — treat the probability range as directional."));
    }
    return out;
  }

  const EVALUATORS = {
    "lease-disputes": evalLeaseDisputes,
    "lending-foreclosure": evalLendingForeclosure,
    "reit-securities": evalReitSecurities,
    "construction-defect": evalConstructionDefect,
    "environmental": evalEnvironmental,
    "eminent-domain": evalEminentDomain,
    "zoning-land-use": evalZoningLandUse
  };

  function evaluate(categorySlug, facts) {
    const fn = EVALUATORS[categorySlug];
    if (!fn) return { claims: [], sideATotal: [0, 0], sideBTotal: [0, 0] };
    const claims = fn(facts).filter(Boolean);
    const catSpec = SPEC[categorySlug];
    let sideATotal = [0, 0], sideBTotal = [0, 0];
    claims.forEach((c) => {
      if (!c.expectedValueRange || c.isBenchmark) return;
      const claimSpec = catSpec.claimTypes[c.claimKey];
      const side = claimSpec ? claimSpec.side : "sideA";
      if (side === "sideA") { sideATotal[0] += c.expectedValueRange[0]; sideATotal[1] += c.expectedValueRange[1]; }
      else if (side === "sideB") { sideBTotal[0] += c.expectedValueRange[0]; sideBTotal[1] += c.expectedValueRange[1]; }
    });
    return { claims, sideATotal, sideBTotal, roles: catSpec ? catSpec.roles : null, categoryLabel: catSpec ? catSpec.label : categorySlug };
  }

  window.RELAW_VALUATION = { evaluate, fmt, fmtRange, pct, SPEC, CITATIONS };
})();
