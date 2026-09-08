/* =========================================================
   CREdocket — Case Value Calculator engine
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

  // Wrongful-lockout damages enhancement, keyed to the ACTUAL statutory
  // remedy mechanism for the property's state (see stateLawModifiers ->
  // wrongfulLockoutRemedyType/Value, merged into facts in collectFacts()).
  // Different states use fundamentally different mechanisms, not just
  // different numbers -- a flat multiplier guess was wrong for most states.
  function computeWrongfulLockoutDamages(facts) {
    const actual = facts.wrongfulLockoutDamages || 0;
    const type = facts.wrongfulLockoutRemedyType;
    const value = facts.wrongfulLockoutRemedyValue;
    const citation = facts.wrongfulLockoutCitation ? ` (${facts.wrongfulLockoutCitation})` : "";
    if (type === "multiplier" && value) {
      // Binary in practice -- either the multiplier is awarded or it isn't --
      // so the range spans actual-only (low) to the full multiplier (high),
      // not a blended partial value.
      return { low: actual, high: actual * value, note: `State statute allows up to a ${value}x multiplier on these damages${citation}.` };
    }
    if (type === "per-day" && value) {
      if (!(facts.daysLockedOut > 0)) {
        return { low: actual, high: actual * 1.15, note: `This state has a $${value}/day statutory penalty${citation} -- enter days locked out to include it; showing actual damages only for now.` };
      }
      const penalty = value * facts.daysLockedOut;
      return { low: actual + penalty, high: actual * 1.25 + penalty, note: `Adds a $${value}/day statutory penalty over ${facts.daysLockedOut} day(s)${citation}.` };
    }
    if (type === "floor" && value) {
      const floorAmt = Math.max(facts.monthlyRent || 0, value);
      return { low: actual + floorAmt, high: actual + floorAmt, note: `Adds the statutory floor -- the greater of one month's rent or $${value}${citation}.` };
    }
    return { low: actual, high: actual * 1.15, note: `No confirmed state statutory enhancement — actual damages only (conservative default)${citation}.` };
  }

  // Posture-tiered attorney's-fee dollar ranges -- replaces an earlier
  // percentage-of-principal heuristic. Real practitioner figures for a
  // typical commercial lease/lending dispute, independent of claim size
  // within that "typical" range (fees are driven by procedural effort,
  // not case size):
  //   no response / default judgment:              $5,000 - $10,000
  //   answer filed, but not really contested:       $15,000 - $25,000
  //   contested, resolved on summary judgment:      $20,000 - $45,000
  //   goes to trial:                                $50,000 - $200,000
  // `litigationPosture` is the explicit fact field ("default" |
  // "answered-passive" | "contested-msj" | "trial"); if not provided,
  // falls back to the `isContested` signal computed by the caller,
  // defaulting to the middle "answered-passive" (uncontested) or
  // "contested-msj" (contested) tier rather than guessing a trial.
  function feesByPosture(facts, isContested) {
    let posture = facts.litigationPosture;
    if (!posture) posture = isContested ? "contested-msj" : "answered-passive";
    const tiers = {
      "default": [5000, 10000, "no response filed -- default judgment"],
      "answered-passive": [15000, 25000, "an answer was filed but the matter wasn't actively contested"],
      "contested-msj": [20000, 45000, "actively contested, resolved on summary judgment"],
      "trial": [50000, 200000, "went to trial"],
    };
    const [low, high, label] = tiers[posture] || tiers["contested-msj"];
    return [low, high, `Posture-tiered flat-dollar estimate (${label}) -- fees are driven by procedural effort, not claim size, for a typical matter in this range; a large or unusually complex matter can run higher.`];
  }

  // Adjusts a raw deficiency-judgment figure/probability using the
  // researched foreclosureStateModifiers for `facts.state` (merged into
  // facts by collectFacts() in case-valuation.js, along with
  // facts.foreclosureMethod from the form). Un-researched states (not in
  // the table) fall through untouched -- same behavior as before this
  // modifier existed.
  function computeDeficiencyStateAdjustment(facts, rawDeficiency, baseProb) {
    let low = rawDeficiency, high = rawDeficiency, prob = baseProb, note = null;
    const method = facts.foreclosureMethod;
    const citation = facts.foreclosureStateCitation ? ` (${facts.foreclosureStateCitation})` : "";
    if (method === "non-judicial" && facts.deficiencyBarredIfNonJudicial) {
      low = 0; high = 0;
      prob = [Math.min(baseProb[0], 0.03), Math.min(baseProb[1], 0.08)];
      note = `Deficiency judgments are barred after a non-judicial foreclosure in ${facts.state}${citation}. ${facts.foreclosureStateNote || ""}`;
    } else if (method === "non-judicial" && facts.deficiencyBarredForBorrowerButGuarantorAvailable) {
      low = 0; high = 0;
      prob = [Math.min(baseProb[0], 0.03), Math.min(baseProb[1], 0.08)];
      note = `A deficiency claim against the borrower entity itself is generally barred after a non-judicial foreclosure in ${facts.state}${citation}. ${facts.foreclosureStateNote || ""} If a guaranty is in place, look to the separate Guaranty Enforcement claim instead -- that route typically remains open.`;
    } else if (method === "non-judicial" && facts.deficiencyConditionalIfNonJudicial) {
      prob = [baseProb[0] * 0.7, baseProb[1] * 0.85];
      note = `${facts.state} requires the lender to complete a further step (timely court confirmation of the sale) to preserve deficiency rights after a non-judicial foreclosure${citation} -- probability reflects real confirmation risk, not just the underlying default dispute. ${facts.foreclosureStateNote || ""}`;
    } else if (facts.fairValueOffsetApplies) {
      // Fair-value offset states: the low end reflects a borrower/guarantor
      // successfully proving the property was worth more than the credit
      // bid, shrinking the deficiency toward zero. The high end keeps the
      // formula's raw figure -- a well-supported credit bid stands.
      low = rawDeficiency * 0.55;
      note = `${facts.state} requires or permits a fair-market-value offset against the sale price in calculating any deficiency${citation} -- the low end of this range reflects a successful fair-value challenge. ${facts.foreclosureStateNote || ""}`;
    } else if (facts.foreclosureStateNote) {
      note = `${facts.foreclosureStateNote}${citation}`;
    }
    if (facts.foreclosureProcedureTrap) {
      note = `${note ? note + " " : ""}Procedural note: ${facts.foreclosureProcedureTrap}`;
    }
    return { low, high, prob, note };
  }

  // Adjusts the indemnification/contribution damages ceiling using
  // facts.indemnityForm (merged into facts by collectFacts() in
  // case-valuation.js from constructionIndemnityStateModifiers[state]).
  // The low end (0.10x, the real Milwaukee GC-share data point) never
  // changes -- a party can always be held to at least its own
  // proportionate fault under any state's rule. What changes is how high
  // the contractual indemnity clause can legally push the ceiling above
  // that proportionate share:
  //   "limited"      -- both broad- and intermediate-form indemnity are
  //                      void; ceiling stays at the existing 0.88x cap,
  //                      which already reflects the real-world proportio-
  //                      nate-allocation ceiling seen in the research
  //                      sample -- no state pushes it higher than this.
  //   "intermediate" -- sole-negligence (broad-form) indemnity is void,
  //                      but full indemnity for CONCURRENT negligence is
  //                      enforceable -- a party with even minor fault can
  //                      contractually be on the hook for the whole
  //                      repair cost, so the ceiling rises to 1.0x.
  //   "broad" / "broad-capped" -- broad-form (even sole-negligence)
  //                      indemnity can be enforced if the contract
  //                      language is unequivocal -- ceiling at 1.0x, with
  //                      a note on the "strictly construed" doctrine
  //                      courts apply to broad-form language, and (for
  //                      broad-capped, i.e. Florida) the statutory
  //                      monetary-cap/bid-disclosure requirement.
  function computeIndemnityStateAdjustment(facts, repairCostEstimate) {
    const form = facts.indemnityForm;
    if (!form) return { low: repairCostEstimate * 0.10, high: repairCostEstimate * 0.88, note: null };
    const citation = facts.indemnityStateCitation ? ` (${facts.indemnityStateCitation})` : "";
    const low = repairCostEstimate * 0.10;
    let high = repairCostEstimate * 0.88;
    let note = null;
    if (form === "limited") {
      note = `${facts.state} voids indemnity clauses beyond each party's own proportionate fault${citation} -- the ceiling stays at the real-world proportionate-allocation figure seen in the research sample. ${facts.indemnityStateNote || ""}`;
    } else if (form === "intermediate") {
      high = repairCostEstimate * 1.0;
      note = `${facts.state} allows full contractual indemnity for concurrent negligence (only indemnifying the indemnitee's SOLE negligence is void)${citation} -- a party with even minor fault can be contractually on the hook for the entire repair cost, raising the ceiling to the full estimate. ${facts.indemnityStateNote || ""}`;
    } else if (form === "broad" || form === "broad-capped") {
      high = repairCostEstimate * 1.0;
      note = `${facts.state} permits broad-form indemnity (covering even the indemnitee's sole negligence) if the contract language is unequivocal${citation} -- courts construe this language strictly against the party seeking indemnity, so enforceability still turns heavily on exact drafting. ${facts.indemnityStateNote || ""}`;
    }
    return { low, high, note };
  }

  // Adjusts spot-zoning / variance-appeal probability using
  // facts.zoningPlanConsistencyRequirement (merged into facts by
  // collectFacts() in case-valuation.js from
  // zoningComprehensivePlanModifiers[state]). A state where zoning must
  // legally CONFORM to the comprehensive plan gives a spot-zoning
  // challenger a real, independently enforceable legal theory when the
  // rezoning conflicts with the plan -- not just an argument about
  // legislative wisdom. A state where the plan is merely advisory means
  // even a demonstrated inconsistency doesn't, on its own, invalidate the
  // zoning. "Conditional" states (mandatory only once/if a plan is
  // adopted, e.g. NY/PA/WI) get the same boost AS Mandatory, since the
  // model assumes the fact pattern already involves an adopted plan.
  function computeZoningStateAdjustment(facts, baseProb) {
    const req = facts.zoningPlanConsistencyRequirement;
    if (!req) return { prob: baseProb, note: null };
    const citation = facts.zoningPlanConsistencyCitation ? ` (${facts.zoningPlanConsistencyCitation})` : "";
    let prob = baseProb, note = null;
    if (req === "Mandatory" || req === "Conditional") {
      prob = [Math.min(baseProb[0] * 1.25, 0.95), Math.min(baseProb[1] * 1.2, 0.95)];
      note = `${facts.state} requires zoning to actually conform to the comprehensive plan${citation} -- a demonstrated inconsistency is an independently enforceable legal theory, not just an argument about legislative wisdom. ${facts.zoningPlanConsistencyNote || ""}`;
    } else if (req === "Advisory") {
      prob = [baseProb[0] * 0.65, baseProb[1] * 0.8];
      note = `${facts.state} treats the comprehensive plan as advisory only${citation} -- even a real, demonstrated inconsistency with the plan does not by itself invalidate the zoning decision, so this theory carries less independent weight here than in a mandatory-consistency state. ${facts.zoningPlanConsistencyNote || ""}`;
    } else if (req === "Split/Unclear") {
      note = `${facts.state}'s courts have reached different conclusions on whether zoning must conform to the comprehensive plan${citation} -- outcome here depends heavily on which line of authority the local court follows. ${facts.zoningPlanConsistencyNote || ""}`;
    }
    return { prob, note };
  }

  // Adjusts environmental-insurance-coverage-dispute probability using
  // facts.pollutionExclusionInterpretation (merged into facts by
  // collectFacts() in case-valuation.js from
  // environmentalPollutionExclusionModifiers[state]). A state whose
  // leading case reads the CGL pollution exclusion BROADLY makes it
  // harder for a policyholder to win coverage; a NARROW-reading state
  // makes it easier. "Mixed" states (a real, documented split between
  // an older governing case and a newer one, e.g. NC, WI) get a note
  // but no probability shift, since which line of authority controls
  // depends on facts this model doesn't capture (policy-form vintage).
  function computeEnvironmentalStateAdjustment(facts, baseProb) {
    const interp = facts.pollutionExclusionInterpretation;
    if (!interp) return { prob: baseProb, note: null };
    const citation = facts.pollutionExclusionCitation ? ` (${facts.pollutionExclusionCitation})` : "";
    let prob = baseProb, note = null;
    if (interp === "Narrow") {
      prob = [Math.min(baseProb[0] * 1.4, 0.7), Math.min(baseProb[1] * 1.35, 0.75)];
      note = `${facts.state}'s leading case reads the pollution exclusion narrowly, limited to traditional environmental pollution${citation} -- meaningfully better odds for the policyholder than the baseline sample, which skews toward insurer wins under broader-reading states. ${facts.pollutionExclusionNote || ""}`;
    } else if (interp === "Broad") {
      prob = [baseProb[0] * 0.6, baseProb[1] * 0.75];
      note = `${facts.state}'s leading case reads the pollution exclusion broadly, per its plain, expansive terms${citation} -- meaningfully worse odds for the policyholder than a narrow-reading state. ${facts.pollutionExclusionNote || ""}`;
    } else if (interp === "Mixed") {
      note = `${facts.state}'s case law is genuinely split on this question, often turning on which generation of policy-form language is at issue${citation} -- probability left at baseline rather than guessing which line of authority a court would follow on these facts. ${facts.pollutionExclusionNote || ""}`;
    }
    return { prob, note };
  }

  // Adjusts a premises-liability injury claim's probability and/or damages
  // for the plaintiff's own alleged comparative-fault percentage, per the
  // state's fault-allocation RULE (merged into facts by collectFacts() in
  // case-valuation.js from premisesLiabilityStateModifiers[state].faultRule).
  // Different rules produce fundamentally different outcomes at the same
  // fault percentage -- a rule-based branch, not a single formula:
  //   Pure Contributory              -- ANY plaintiff fault (>0%) bars
  //                                      recovery entirely.
  //   Modified Comparative (50% Bar) -- barred once fault reaches 50%.
  //   Modified Comparative (51% Bar) -- barred only once fault EXCEEDS 50%
  //                                      (51%+).
  //   Pure Comparative               -- damages reduced by the fault
  //                                      percentage, no bar, ever.
  //   Slight/Gross (South Dakota)    -- no percentage math; modeled
  //                                      conservatively as barred once
  //                                      alleged fault reaches 30%, since SD
  //                                      case law has found fault that high
  //                                      too much to qualify as "slight."
  function computePremisesLiabilityFaultAdjustment(facts, baseProb, damagesLow, damagesHigh) {
    const faultPct = typeof facts.plaintiffComparativeFaultPercent === "number" ? facts.plaintiffComparativeFaultPercent : 0;
    const rule = facts.premisesFaultRule;
    let prob = baseProb, low = damagesLow, high = damagesHigh, note = null;
    if (!rule || !(faultPct > 0)) return { prob, low, high, note };
    const citation = facts.premisesFaultRuleCitation ? ` (${facts.premisesFaultRuleCitation})` : "";
    if (rule === "Pure Contributory") {
      prob = [Math.min(prob[0], 0.03), Math.min(prob[1], 0.08)];
      note = `${facts.state} is a pure contributory negligence jurisdiction${citation} -- ANY plaintiff fault, even ${faultPct}%, bars recovery entirely as a matter of law. Probability shown reflects only the small chance a court finds the plaintiff free of fault despite the alleged percentage.`;
    } else if (rule === "Modified Comparative (50% Bar)") {
      if (faultPct >= 50) {
        prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
        note = `${facts.state} bars recovery once the plaintiff's fault reaches 50%${citation} -- at ${faultPct}% alleged fault, recovery is barred outright unless that percentage is successfully contested down.`;
      } else {
        const factor = 1 - faultPct / 100;
        low *= factor; high *= factor;
        note = `${facts.state} reduces recovery by the plaintiff's own fault percentage, barring recovery only at 50% or more${citation} -- damages reduced ${faultPct}% for the alleged comparative fault.`;
      }
    } else if (rule === "Modified Comparative (51% Bar)") {
      if (faultPct > 50) {
        prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
        note = `${facts.state} bars recovery once the plaintiff's fault exceeds 50%${citation} -- at ${faultPct}% alleged fault, recovery is barred outright unless that percentage is successfully contested down.`;
      } else {
        const factor = 1 - faultPct / 100;
        low *= factor; high *= factor;
        note = `${facts.state} reduces recovery by the plaintiff's own fault percentage, barring recovery only once it exceeds 50%${citation} -- damages reduced ${faultPct}% for the alleged comparative fault.`;
      }
    } else if (rule === "Pure Comparative") {
      const factor = 1 - faultPct / 100;
      low *= factor; high *= factor;
      note = `${facts.state} is a pure comparative negligence jurisdiction${citation} -- damages reduced ${faultPct}% for the plaintiff's own alleged fault, with no bar regardless of how high that percentage runs.`;
    } else if (rule.indexOf("Slight/Gross") === 0) {
      if (faultPct >= 30) {
        prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
        note = `South Dakota uses a unique "slight/gross" comparison rather than a percentage allocation${citation} -- courts have found alleged fault as low as 30% too much to qualify as "slight," which bars recovery outright. At ${faultPct}% alleged fault, treat recovery as barred absent a strong argument the plaintiff's conduct was genuinely minor.`;
      } else {
        note = `South Dakota uses a unique "slight/gross" comparison rather than a percentage allocation${citation} -- at ${faultPct}% alleged fault, this may still qualify as "slight" if the defendant's negligence was comparatively "gross," but the standard is vague and fact-specific; no formulaic damages reduction applies the way it would in a percentage-based state.`;
      }
    }
    return { prob, low, high, note };
  }

  // Adjusts the failure-to-warn claim's open-and-obvious-defense penalty
  // using the state's actual DOCTRINE TYPE (merged into facts by
  // collectFacts() from premisesLiabilityStateModifiers[state]
  // .openAndObviousDoctrine) rather than one flat penalty for every
  // state. This is a real, confirmed three-way split -- see the deep
  // research pass's comment block at the top of premisesLiabilityState-
  // Modifiers in case-valuation-data.js:
  //   Traditional No-Duty Bar        -- obviousness defeats the claim
  //                                      outright in most cases; harshest
  //                                      penalty.
  //   No-Duty-to-Warn-but-Duty-to-   -- Restatement (Second) Sec. 343A --
  //   Remedy                            no duty to WARN of the obvious
  //                                      hazard, but a separate duty to
  //                                      REMEDY it survives if harm was
  //                                      still foreseeable; moderate
  //                                      penalty (this engine's original
  //                                      default, kept as the fallback
  //                                      for unresearched states too).
  //   Comparative-Fault-Factor-Only  -- a growing trend (Michigan 2023,
  //                                      Arizona 2025 confirmed this
  //                                      pass) -- obviousness isn't a
  //                                      duty bar at all, just a jury
  //                                      comparative-fault factor;
  //                                      minimal penalty here since the
  //                                      real effect shows up in the
  //                                      separate fault-percentage
  //                                      adjustment, not this claim's
  //                                      own viability.
  function computeOpenAndObviousStateAdjustment(facts, baseProb) {
    if (!facts.openAndObviousDefenseRaised) return { prob: baseProb, note: null };
    // premisesOpenAndObviousRule is a normalized enum derived from the
    // richer, free-text premisesOpenAndObviousDoctrine field (some
    // researched states describe a genuine hybrid/unclear rule that
    // doesn't cleanly fit one of the three buckets -- those fall through
    // to the generic default below rather than being force-fit).
    const rule = facts.premisesOpenAndObviousRule;
    const citation = facts.premisesOpenAndObviousCitation ? ` (${facts.premisesOpenAndObviousCitation})` : "";
    if (rule === "Traditional No-Duty Bar") {
      return { prob: [0.05, 0.15], note: `${facts.state} treats an open-and-obvious hazard as a full no-duty bar${citation} -- this defense is usually outright dispositive here, not just a factor.` };
    }
    if (rule === "Comparative-Fault-Factor-Only") {
      return { prob: [0.30, 0.50], note: `${facts.state} does not treat obviousness as a duty bar at all${citation} -- it goes to the jury purely as a comparative-fault factor, so this claim survives with only a modest reduction (the real effect shows up in the fault-percentage adjustment, not here).` };
    }
    if (rule === "No-Duty-to-Warn-but-Duty-to-Remedy") {
      return { prob: [0.15, 0.30], note: `${facts.state} follows the Restatement (Second) Sec. 343A rule${citation} -- no duty to warn of the obvious hazard, but a separate duty to remedy it survives if harm was still foreseeable despite the obviousness.` };
    }
    return { prob: [0.15, 0.30], note: facts.premisesOpenAndObviousDoctrine ? `${facts.state}'s open-and-obvious rule: ${facts.premisesOpenAndObviousDoctrine}${citation}.` : null };
  }

  // Adjusts the inadequate-security claim's prior-incidents penalty using
  // the state's actual negligent-security FORESEEABILITY TEST (merged
  // into facts from premisesLiabilityStateModifiers[state]
  // .negligentSecurityForeseeabilityTest) -- a real, confirmed four-way
  // split rather than a single prior-incidents-or-not question:
  //   Prior Similar Incidents  -- the strict rule: without a substantially
  //                               similar prior crime on the property or
  //                               its immediate vicinity, the claim is
  //                               genuinely weak.
  //   Totality of the          -- looser: prior incidents are only ONE
  //   Circumstances               factor among many (nature of business,
  //                               location, area crime patterns, existing
  //                               security) -- a real claim can survive
  //                               without them.
  //   Balancing Test            -- foreseeability weighed against the
  //   (e.g. California's Ann M.)  burden of the proposed security measure
  //                               -- similar practical effect to totality
  //                               of the circumstances for this model.
  //   Specific Harm Rule        -- the most restrictive: the owner must
  //                               have known of an imminent, SPECIFIC
  //                               danger to the specific plaintiff --
  //                               even a real pattern of prior incidents
  //                               doesn't automatically clear this bar.
  function computeNegligentSecurityStateAdjustment(facts, hasPriorIncidents) {
    // premisesNegligentSecurityTestNormalized is a normalized enum
    // derived from the richer, free-text premisesNegligentSecurityTest
    // field -- several researched states described a genuinely mixed or
    // unconfirmed test that doesn't cleanly fit one of the four buckets;
    // those fall through to the generic default below.
    const test = facts.premisesNegligentSecurityTestNormalized;
    const citation = facts.premisesNegligentSecurityCitation ? ` (${facts.premisesNegligentSecurityCitation})` : "";
    if (test === "Specific Harm Rule") {
      const prob = hasPriorIncidents ? [0.28, 0.48] : [0.05, 0.12];
      return { prob, note: `${facts.state} applies the restrictive "specific harm" rule${citation} -- the owner must have known of an imminent, SPECIFIC danger to this plaintiff; even a real pattern of prior incidents doesn't automatically clear this bar, which is why the odds here stay capped well below what a looser-test state would show on the same facts.` };
    }
    if (test === "Totality of the Circumstances" || test === "Balancing Test") {
      const prob = hasPriorIncidents ? [0.50, 0.72] : [0.20, 0.35];
      return { prob, note: `${facts.state} uses a ${test.toLowerCase()}${citation} -- prior incidents are only one factor among several (nature of the business, location, area crime patterns, existing security measures), so this claim carries real weight even without them, and is stronger still with them.` };
    }
    if (test === "Prior Similar Incidents") {
      const prob = hasPriorIncidents ? [0.45, 0.68] : [0.08, 0.18];
      return { prob, note: `${facts.state} applies the strict "prior similar incidents" rule${citation} -- without a substantially similar prior crime on the property or its immediate vicinity, this claim faces a real, specific obstacle beyond the general difficulty of negligent-security claims.` };
    }
    // Unresearched/unknown test -- fall back to the original generic
    // prior-incidents-or-not treatment rather than guessing a regime.
    const prob = hasPriorIncidents ? [0.45, 0.68] : [0.18, 0.32];
    return { prob, note: null };
  }

  // Determines whether/how a punitive-damages claim can be added on top of
  // an underlying premises-liability injury claim, using the state's
  // punitive-damages evidentiary STANDARD and any confirmed CAP (merged
  // into facts by collectFacts() from premisesLiabilityStateModifiers
  // [state]). Several states genuinely prohibit punitive damages in an
  // ordinary tort claim, or require a specific enabling statute -- those
  // return prob [0, 0] rather than a nonzero number, per the same
  // never-fabricate-precision discipline used throughout this file.
  function computePunitiveDamagesAvailability(facts, compensatoryLow, compensatoryHigh) {
    const standard = facts.premisesPunitiveDamagesStandard || "";
    const capNote = facts.premisesPunitiveDamagesCap || "";
    if (/^PROHIBITED/.test(standard)) {
      return { prob: [0, 0], low: 0, high: 0, note: `Punitive damages are unavailable in ${facts.state} for an ordinary premises-liability claim: ${standard.replace(/^PROHIBITED -- /, "")}` };
    }
    if (/^STATUTE-ONLY/.test(standard)) {
      return { prob: [0, 0.05], low: 0, high: compensatoryHigh * 0.5, note: `${facts.state} generally does not allow punitive damages absent a specific enabling statute: ${standard.replace(/^STATUTE-ONLY -- /, "")} Confirm whether a specific statute applies to this fact pattern before assuming this theory is viable at all.` };
    }
    let prob = [0.08, 0.20];
    if (/BEYOND A REASONABLE DOUBT/.test(standard)) {
      prob = [0.03, 0.10];
    } else if (/^Preponderance/.test(standard)) {
      prob = [0.12, 0.28];
    }
    const low = compensatoryLow * 0.5;
    const high = compensatoryHigh * 1.5;
    return { prob, low, high, note: `Requires proof the property owner's conduct was willful, wanton, or in reckless disregard of a known danger -- ordinary negligence alone never supports punitive damages. Evidentiary standard in ${facts.state}: ${standard || "not researched"}.${capNote ? " Cap: " + capNote : ""}` };
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
      // Probability revised DOWN from the original [0.80, 0.95] after a
      // deeper citation pass: 5 of 7 real cases in the research sample
      // (Cheetah Properties v. Panther Pressure Testers, 2016 ND 102;
      // Mel-Lo Enterprises v. Belle Starr Saloon, 716 S.W.2d 828 (Mo. Ct.
      // App. 1986); plus the file's existing Baca v. Kuang, Lincoln
      // Oldsmobile v. Branch, and Spatz v. 2263 North Lincoln Corp.) are
      // landlord LOSSES on the enhanced multiplier specifically, each on
      // an independent legal ground (no willfulness, no timely demand, a
      // colorable good-faith right to remain in possession). The old
      // range looks like it was really measuring "does a holdover fact
      // pattern support SOME recovery" (which it does, almost always —
      // landlords still won actual/unpaid rent in nearly every sampled
      // case) rather than "does the enhanced MULTIPLIER specifically
      // apply," which the sample suggests fails well more often than a
      // 80-95% probability would imply.
      out.push(result("holdover_damages", "Statutory Holdover Damages", [0.35, 0.55],
        facts.monthlyRent * 1.5 * facts.holdoverMonths, facts.monthlyRent * 2 * facts.holdoverMonths,
        "Uses a 1.5x–2x statutory multiplier range if the multiplier applies at all — 3x is uncommon in practice per practitioner review. Getting the underlying holdover-occupancy fact established is the easy part; the enhanced multiplier itself is denied more often than not in the research sample, typically on one of three independent grounds: no willfulness (where the state requires it), no timely demand for possession, or a colorable good-faith claim of a continuing right to occupy. Confirm which of these defenses is realistically available before assuming the multiplier will apply."));
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
        const enhanced = computeWrongfulLockoutDamages(facts);
        out.push(result("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p,
          enhanced.low, enhanced.high, enhanced.note));
      } else {
        out.push(result("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p, null, null,
          "No damages amount entered — probability shown reflects state self-help law and whether statutory process was followed."));
      }
      // Improper self-help that disrupts the tenant's OWN contracts with its
      // customers, suppliers, or employees (not just the landlord-tenant
      // relationship itself) can separately support a tortious interference
      // with contract claim -- opening lost-profits exposure beyond whatever
      // the wrongful-lockout statute alone provides. Distinct claim, distinct
      // theory -- per practitioner review, worth flagging as its own line
      // item rather than folding into "actual damages" above.
      if (facts.selfHelpDisruptedThirdPartyContracts && facts.lostProfitsFromInterference > 0) {
        out.push(result("tortious_interference_lost_profits", "Tortious Interference with Contract (Lost Profits)", [0.25, 0.55],
          facts.lostProfitsFromInterference * 0.4, facts.lostProfitsFromInterference * 0.9,
          "A separate theory from the wrongful-lockout claim above: if the lockout disrupted the tenant's contracts with its own customers, suppliers, or employees (not just its occupancy), that can independently support tortious interference with contract, opening lost-profits exposure. Requires proving intent/improper means and a specific disrupted business expectancy -- fact-intensive, no case citation grounded here yet."));
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
      const isContested = !!facts.tenantDisputesDebt ||
        out.some((c) => c.claimKey === "wrongful_lockout" || c.claimKey === "quiet_enjoyment_breach");
      const [feeLow, feeHigh, postureNote] = feesByPosture(facts, isContested);
      out.push(result("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
        feeLow, feeHigh, postureNote));
    }
    return out;
  }

  /* ---------- lending-foreclosure ---------- */
  function evalLendingForeclosure(facts) {
    const out = [];
    const guarantorDisputes = facts.guarantorAssertsCounterclaimOrOffset;
    const isContested = !!facts.borrowerDisputesDefault || !!guarantorDisputes;
    if (facts.loanBalance > 0 && facts.foreclosureFiled) {
      let p = facts.borrowerDisputesDefault ? [0.60, 0.80] : [0.85, 0.97];
      const advances = facts.lenderAdvances || 0;
      const proceeds = facts.saleProceeds || 0;
      const gross = facts.loanBalance + advances;
      const rawDeficiency = Math.max(0, gross - proceeds);
      const adj = computeDeficiencyStateAdjustment(facts, rawDeficiency, p);
      const baseNote = "This is the legal deficiency the court would enter judgment for, not a prediction of what will actually be collected. Whether a judgment is ultimately collectable depends heavily on the borrower/guarantor's post-judgment asset picture and is outside the scope of this calculator — treat this figure as case value, not a collection forecast.";
      out.push(result("foreclosure_deficiency_judgment", "Foreclosure / Deficiency Judgment", adj.prob,
        adj.low, adj.high,
        adj.note ? `${baseNote} ${adj.note}` : baseNote));
    }
    if (facts.receivershipMotionFiled) {
      out.push(result("receivership_dispute", "Receivership Grant/Denial", [0.65, 0.85], null, null,
        "Not a dollar claim — operational-control relief. 5 of 6 sampled real matters resulted in a receiver appointed."));
    }
    if (facts.guarantyTriggerAlleged && facts.guaranteedBalance > 0) {
      if (guarantorDisputes) {
        out.push(result("guaranty_enforcement", "Guaranty Enforcement", [0.45, 0.70],
          facts.guaranteedBalance * 0.50, facts.guaranteedBalance * 0.85,
          "A counterclaim or offset has been pled against the guaranty, which meaningfully reduces both the odds of full recovery and the likely dollar outcome — this becomes a genuinely contested fact question rather than a clean carve-out breach."));
      } else {
        out.push(result("guaranty_enforcement", "Guaranty Enforcement", [0.80, 0.97],
          facts.guaranteedBalance * 0.95, facts.guaranteedBalance,
          "Once a carve-out (\"bad boy\") trigger is credibly found and undisputed — no counterclaim or offset pled — sampled real cases show guarantors held liable for close to the full guaranteed balance, even for technical/non-fraud breaches. The harder question — proving the trigger occurred in the first place — isn't modeled as a separate probability here. A deeper citation pass found this range is really averaging two different populations: full-recourse enforcement in states with no legislative carve-back (the majority of the sample, including 172 Madison (NY) LLC v. NMP-Group and the file's existing Cherryland/Princeton Park/Gratiot Avenue citations), versus states with a post-Cherryland anti-full-recourse statute (confirmed in Michigan and Ohio) that can defeat an otherwise-valid guaranty claim outright, as in Borman LLC v. Borman LLC (6th Cir. 2015, defeating a $6M claim under Michigan's Non-Recourse Mortgage Loan Act) — a real candidate for its own state-law modifier table rather than one blended probability."));
      }
    }
    if (facts.lenderMisconductAlleged) {
      const claimed = facts.lenderLiabilityDamagesClaimed || 0;
      const egregious = facts.egregiousConductAlleged;
      const p = egregious ? [0.20, 0.40] : [0.10, 0.25];
      const low = claimed > 0 ? claimed * (egregious ? 0.35 : 0.20) : null;
      const high = claimed > 0 ? claimed * (egregious ? 1.5 : 0.55) : null;
      out.push(result("lender_liability_claim", "Lender Liability (borrower-asserted)", p, low, high,
        egregious
          ? "Historically borrower-unfriendly absent clear bad faith, but egregious conduct changes the calculus — damages here can include contract damages, lost profits, out-of-pocket costs, and potentially exemplary/punitive damages, which is reflected in the wider high end."
          : "Historically borrower-unfriendly absent clear bad faith; recent real cases trend toward procedural wins rather than dollar outcomes. Damages, if any, are typically limited to contract damages and out-of-pocket costs."));
    }
    if (facts.hasFeeShiftingClause && out.length) {
      const avgP = out.reduce((s, c) => s + (c.probability[0] + c.probability[1]) / 2, 0) / out.length;
      const [feeLow, feeHigh, postureNote] = feesByPosture(facts, isContested);
      out.push(result("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
        feeLow, feeHigh, postureNote));
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
      const adj = computeIndemnityStateAdjustment(facts, facts.repairCostEstimate);
      const baseNote = "Real allocation example: an 88%/10%/2% subcontractor/GC/owner split when the defect traced to specific subcontractor workmanship.";
      out.push(result("indemnification_contribution_claim", "Indemnification / Contribution", [0.40, 0.70],
        adj.low, adj.high,
        adj.note ? `${baseNote} ${adj.note}` : baseNote));
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
      const innocent = facts.innocentLandownerStatus;
      let low = facts.cleanupCostsIncurred * 0.5, high = facts.cleanupCostsIncurred;
      let innocentNote = "";
      // A property owner who qualifies as a CERCLA Sec. 107(b) "innocent
      // landowner" can pursue a full Sec. 107(a) cost-recovery action and
      // recover the entire cost from the actually-liable PRP -- a PRP who
      // does NOT qualify is instead limited to a Sec. 113(f)(1)
      // contribution claim for only the other party's equitable share
      // (Advanced Tech. Corp. v. Eliskim, Inc., No. 1:96CV755 (N.D. Ohio
      // May 3, 2000), laying out the 5-factor innocent-landowner test and
      // this exact doctrinal fork). A current owner who can't clear that
      // bar is also exposed to being held liable for the FULL scope of
      // response costs themselves, including costs incurred before they
      // even owned the property (Pa. Dep't of Envtl. Prot. v. Trainer
      // Custom Chem., LLC, 906 F.3d 85 (3d Cir. 2018)) -- so a
      // non-innocent owner's own "recovery" claim functions more like a
      // contribution claim in substance, even if styled as cost recovery.
      if (innocent === "yes") {
        low = facts.cleanupCostsIncurred * 0.85;
        high = facts.cleanupCostsIncurred * 1.0;
        innocentNote = " The owner qualifying as an innocent landowner supports a full Sec. 107(a) cost-recovery claim rather than a contribution claim -- pushing this range toward complete recovery.";
      } else if (innocent === "no") {
        low = facts.cleanupCostsIncurred * 0.20;
        high = facts.cleanupCostsIncurred * 0.60;
        innocentNote = " Without innocent-landowner status, this functions more like a contribution claim in substance (the owner is itself a PRP with some equitable share of responsibility) -- the range is scaled down accordingly, in line with the separate CERCLA Contribution claim's own range.";
      }
      out.push(result("cercla_cost_recovery", "CERCLA Cost Recovery", [0.65, 0.85], low, high,
        `Liability is strict/joint/several once PRP status attaches — allocation share is the real question, not whether liability exists at all. Real benchmark tiers: multi-decade waterway/legacy sites $130M–$670M; a real mid-size tier in between (e.g. Petroleum Products Corp., Pembroke Park FL, ~$62M) that a later citation pass confirmed fills what had been a $20M–$130M gap with no benchmark at all; single-parcel soil-only $3M–$19M; small commercial state-penalty actions $85K–$120K.${innocentNote}`));
    }
    if (facts.multiplePRPs && facts.cleanupCostsIncurred > 0) {
      out.push(result("cercla_contribution_claim", "CERCLA Contribution (PRP vs. PRP)", [0.55, 0.80],
        facts.cleanupCostsIncurred * 0.20, facts.cleanupCostsIncurred * 0.60,
        "Courts apply equitable factors that typically REDUCE a mechanically-calculated share, and an unrecoverable 'orphan share' for defunct/judgment-proof historical operators is common."));
    }
    if (facts.stateConsentDecree) {
      out.push(result("state_cleanup_consent_decree", "State Cleanup Order / Consent Decree", [1, 1], null, null,
        "Benchmark only, not an adversarial probability — nearly all consent decrees are negotiated. See real benchmark tiers above under CERCLA Cost Recovery. The ceiling for this benchmark moved dramatically in a later citation pass: the newly-approved combined New Jersey DuPont/3M PFAS settlement is $2.5 BILLION -- roughly 6.4x the previous largest sample point (Solvay's $393M West Deptford PFAS order) -- with New Jersey's Pohatcong Valley order (~$49.5M) and a standalone 3M order (~$450M) both filling in the space between. Treat a nine-figure-or-higher consent decree as a real, not exceptional, possibility for a large PFAS or legacy-contamination site.", true));
    }
    if (facts.insurerDeniedEnvCoverage) {
      const base = [0.25, 0.45];
      const adj = computeEnvironmentalStateAdjustment(facts, base);
      const baseNote = "Expanded to a roughly 10-case sample (a deeper citation pass added Griffith Foods, Bradley v. Travelers, New Castle County v. Hartford, and Broadwell Realty), still close to balanced between insurer and policyholder wins, if anything tilted slightly policyholder-favorable. Outcome is usually binary (coverage owed / not owed), not a dollar figure.";
      out.push(result("environmental_insurance_coverage_dispute", "Environmental Insurance Coverage Dispute", adj.prob, null, null,
        adj.note ? `${baseNote} ${adj.note}` : baseNote));
    }
    return out;
  }

  /* ---------- eminent-domain ---------- */
  function evalEminentDomain(facts) {
    const out = [];
    let estimatedAward = null; // [lo, hi], reused below for the attorney-fee threshold check
    if (facts.initialOffer > 0) {
      const severance = facts.severanceDamagesClaimed;
      const goodwill = facts.businessGoodwillLossClaimed;
      const goodwillRecognized = facts.eminentDomainGoodwillRecognized;
      // Severance/access damage to a remainder parcel is compensable in
      // essentially every US jurisdiction as part of the Fifth Amendment
      // "just compensation" requirement -- no real state-variance issue,
      // so it always qualifies for the wide, case-researched uplift tier.
      // Business/goodwill loss is different: most states treat it as
      // non-compensable "consequential" damage absent a specific statute
      // (majority rule) -- it only earns the wide tier where the state
      // actually recognizes it (confirmed for California; see
      // eminentDomainBusinessGoodwill in case-valuation-data.js for the
      // caveat that a minority of other states may have their own
      // narrower, not-individually-verified statutes).
      const wideTierApplies = severance || (goodwill && goodwillRecognized);
      const [loMult, hiMult] = wideTierApplies ? [2.0, 5.0] : [0.5, 1.0];
      const lo = facts.initialOffer * (1 + loMult);
      const hi = facts.initialOffer * (1 + hiMult);
      estimatedAward = [lo, hi];
      let note = wideTierApplies
        ? "Severance/access/business-value disputes ran 2x–5x+ above the initial offer in the research sample (one case ~49x)."
        : "Routine comparable-sales-driven disputes ran ~50–100% above the initial offer in the research sample. Probability is shown as 100% because the property is being taken either way — the uncertainty here is in the VALUATION, not whether compensation is owed, so the full estimated award counts toward net position.";
      if (goodwill && goodwillRecognized) {
        note += ` Business-goodwill loss included: ${facts.eminentDomainGoodwillNote} (${facts.eminentDomainGoodwillCitation})`;
      } else if (goodwill && !goodwillRecognized) {
        note += ` A separate business-goodwill claim was flagged but excluded from this estimate: ${facts.eminentDomainGoodwillNote}`;
      }
      out.push(result("just_compensation_valuation", "Just Compensation Valuation", [1, 1], lo, hi, note));

      // Attorney-fee shifting is real and state-specific (51-jurisdiction
      // research in eminentDomainAttorneyFees), but only mechanized into a
      // dollar estimate where the state's rule is a clean percentage-
      // above-the-offer threshold -- see the data file for every other
      // state's real, cited rule even where it isn't mechanized here.
      if (estimatedAward && typeof facts.eminentDomainFeeThresholdPct === "number") {
        const thresholdMultiplier = 1 + facts.eminentDomainFeeThresholdPct / 100;
        if (estimatedAward[0] >= facts.initialOffer * thresholdMultiplier) {
          const excessLow = estimatedAward[0] - facts.initialOffer;
          const excessHigh = estimatedAward[1] - facts.initialOffer;
          // Fraction of the excess awarded as fees: use the state's own
          // statutory cap fraction where the research found one (Michigan
          // 1/3, Ohio 25%), otherwise a general reasonable-fees proxy --
          // clearly a proxy, not itself a cited figure, since "reasonable
          // fees" is fact-specific by design in every one of these statutes.
          const capNote = facts.eminentDomainFeeCapNote || "";
          let feeLoFrac = 0.20, feeHiFrac = 0.35;
          if (/1\/3/.test(capNote)) { feeLoFrac = 0.28; feeHiFrac = 1 / 3; }
          else if (/25%/.test(capNote)) { feeLoFrac = 0.18; feeHiFrac = 0.25; }
          let feeLow = excessLow * feeLoFrac;
          let feeHigh = excessHigh * feeHiFrac;
          const dollarCapMatch = /\$([\d,]+)/.exec(capNote);
          if (dollarCapMatch) {
            const cap = parseInt(dollarCapMatch[1].replace(/,/g, ""), 10);
            feeLow = Math.min(feeLow, cap);
            feeHigh = Math.min(feeHigh, cap);
          }
          const p = facts.eminentDomainFeeMandatory ? [0.65, 0.85] : [0.35, 0.55];
          out.push(result("eminent_domain_attorney_fees", "Attorney's Fees (Fee-Shifting)", p, feeLow, feeHigh,
            `${facts.eminentDomainFeeNote} (${facts.eminentDomainFeeCitation})${capNote ? " " + capNote : ""}`));
        }
      } else if (facts.state && facts.eminentDomainFeeNote && facts.eminentDomainFeeThresholdPct === null) {
        // Not a clean percentage threshold (discretionary, conditional on
        // abandonment/inverse claims, or no fee-shifting at all) -- fold
        // the real researched rule into the valuation note instead of
        // fabricating a probability for a claim that isn't mechanizable.
        out[out.length - 1].note += ` Attorney's fees: ${facts.eminentDomainFeeNote} (${facts.eminentDomainFeeCitation})`;
      }
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
      // Revised up from [0.25, 0.45] after a deeper citation pass grew
      // the sample to 10 cases, ~6 of 8 decisive outcomes reversing the
      // denial -- see the note on this claim type in case-valuation-
      // data.js for the citations and the deliberately modest size of
      // the bump given a real, still-present outcome-selection-bias risk.
      const base = [0.30, 0.50];
      const adj = computeZoningStateAdjustment(facts, base);
      const baseNote = "Zoning boards get significant judicial deference; reversal requires a clear legal or procedural error.";
      out.push(result("variance_permit_denial_appeal", "Variance / Permit Denial Appeal", adj.prob, null, null,
        adj.note ? `${baseNote} ${adj.note}` : baseNote));
    }
    if (facts.spotZoningAlleged) {
      const base = [0.30, 0.50];
      const adj = computeZoningStateAdjustment(facts, base);
      const baseNote = "4-case sample (3 successful, 1 confirmed loss) — treat cautiously as still a small sample.";
      out.push(result("spot_zoning_challenge", "Spot Zoning Challenge", adj.prob, null, null,
        adj.note ? `${baseNote} ${adj.note}` : baseNote));
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

  /* ---------- premises-liability ---------- */
  function evalPremisesLiability(facts) {
    const out = [];
    const specials = facts.medicalSpecialsIncurred || 0;
    const wages = facts.lostWagesClaimed || 0;
    // "Multiplier method" general-damages tiers -- an industry rule-of-thumb
    // range used throughout personal-injury claims practice (medical
    // specials x a severity-tiered multiplier, with lost wages added
    // separately, undiscounted), NOT itself drawn from a specific cited
    // case. Actual jury/settlement values in a given matter can fall well
    // outside these ranges.
    const severityMultipliers = {
      "minor": [1.5, 2.5],
      "moderate": [2, 4],
      "severe": [3, 5],
      "catastrophic": [4, 8]
    };
    const mult = severityMultipliers[facts.injurySeverity] || [2, 4];
    const damageNote = "Uses the general-damages \"multiplier method\" common in personal-injury claims practice (medical specials x a severity-tiered multiplier, plus lost wages added separately) -- an industry rule-of-thumb range, not itself drawn from a specific cited case; actual jury/settlement values in a given matter can fall well outside it.";

    function pushInjuryClaim(claimKey, label, baseProb, extraNote) {
      if (!(specials > 0)) return;
      const rawLow = specials * mult[0] + wages;
      const rawHigh = specials * mult[1] + wages;
      const adj = computePremisesLiabilityFaultAdjustment(facts, baseProb, rawLow, rawHigh);
      const note = [extraNote, damageNote, adj.note].filter(Boolean).join(" ");
      out.push(result(claimKey, label, adj.prob, adj.low, adj.high, note));
    }

    // A claim gets this note appended when the property's state genuinely
    // treats premises liability (a condition of the property) as a
    // distinct cause of action from ordinary negligence (a contemporaneous
    // activity) -- confirmed this research pass not just in Texas (the
    // famous example, Keetch v. Kroger Co., 845 S.W.2d 262 (Tex. 1992))
    // but also Colorado, Florida, Georgia, Illinois, Louisiana, and
    // Michigan. Mislabeling the theory is outcome-determinative in these
    // states, so it's surfaced on every claim, not buried in a footnote.
    const distinctClaimNote = facts.premisesLiabilityDistinct
      ? ` PLEADING NOTE: ${facts.state} treats premises liability as legally distinct from an ordinary negligent-activity claim -- confirm this is pled/argued under the correct theory, since mischaracterizing it can be outcome-determinative here.`
      : "";

    if (facts.slipAndFallAlleged) {
      let p = [0.35, 0.55];
      let extraNote = "Slip-and-fall claims turn overwhelmingly on whether the property owner had actual or constructive NOTICE of the hazardous condition long enough before the injury to have fixed or warned of it -- most claims that fail, fail on notice, not on whether a hazard existed at all.";
      if (facts.hazardNoticeProven === "yes") {
        p = [0.55, 0.75];
        extraNote += " Notice has been proven here, which materially improves the odds above the baseline range.";
      } else if (facts.hazardNoticeProven === "no") {
        p = [0.12, 0.28];
        extraNote += " No notice evidence has been identified here, which materially worsens the odds below the baseline range -- see Albertsons, LLC v. Mohammadi (Tex. 2024), where knowledge of an upstream cause was held not to be evidence of knowledge of the specific hazard itself.";
        const modeAdopted = facts.premisesModeOfOperationAdopted;
        if (facts.selfServiceModeOfOperationApplicable && (modeAdopted === true || modeAdopted === "partial")) {
          p = [0.28, 0.48];
          extraNote += ` However, ${facts.state} has ${modeAdopted === "partial" ? "at least partially " : ""}adopted the "mode of operation" rule${facts.premisesModeOfOperationCitation ? ` (${facts.premisesModeOfOperationCitation})` : ""} -- since this hazard fits a self-service business's own operating method, the plaintiff may be able to skip proving notice of THIS specific hazard entirely, which meaningfully improves the odds despite the notice gap above.`;
        }
      }
      pushInjuryClaim("slip_and_fall_hazardous_condition", "Slip-and-Fall / Hazardous Condition", p, extraNote + distinctClaimNote);
    }

    if (facts.inadequateSecurityAlleged) {
      const secAdj = computeNegligentSecurityStateAdjustment(facts, !!facts.priorSimilarCrimeIncidents);
      let extraNote = "Inadequate/negligent-security claims require proving the criminal act was FORESEEABLE to the property owner -- a genuinely harder bar than an ordinary hazard claim, and the state's specific foreseeability test (see below) usually matters more than any other single fact.";
      extraNote += facts.priorSimilarCrimeIncidents
        ? " Prior similar incidents have been identified here (see Georgia CVS Pharmacy, LLC v. Carmichael, 316 Ga. 718 (2023))."
        : " No prior similar incidents have been identified here.";
      if (secAdj.note) extraNote += " " + secAdj.note;
      pushInjuryClaim("inadequate_security_third_party_crime", "Inadequate Security / Third-Party Criminal Act", secAdj.prob, extraNote + distinctClaimNote);
    }

    if (facts.structuralFailureAlleged) {
      const p = [0.40, 0.60];
      const extraNote = "Structural/maintenance failures (collapsed railings, failed stairs, defective elevators, etc.) are typically easier to prove than a transient hazard like a spill, since the defect itself is durable and can usually be established through inspection and expert testimony rather than relying on notice timing alone.";
      pushInjuryClaim("negligent_maintenance_structural_failure", "Negligent Maintenance / Structural Failure", p, extraNote + distinctClaimNote);
    }

    if (facts.failureToWarnAlleged) {
      const base = [0.35, 0.55];
      const oaoAdj = computeOpenAndObviousStateAdjustment(facts, base);
      let extraNote = "A failure-to-warn theory turns on whether the danger was hidden/non-obvious -- how an obvious hazard is treated is one of the more consequential state-law splits in this whole area (see the state's open-and-obvious doctrine type below).";
      if (facts.openAndObviousDefenseRaised) {
        extraNote += oaoAdj.note ? " " + oaoAdj.note : " The open-and-obvious defense has been raised here.";
      }
      pushInjuryClaim("dangerous_condition_failure_to_warn", "Dangerous Condition / Failure to Warn", oaoAdj.prob, extraNote + distinctClaimNote);
    }

    if (facts.egregiousConductAllegedForPunitives && out.length) {
      const compLow = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[0] : 0), 0);
      const compHigh = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[1] : 0), 0);
      const pun = computePunitiveDamagesAvailability(facts, compLow, compHigh);
      out.push(result("premises_punitive_damages", "Punitive Damages", pun.prob, pun.low, pun.high, pun.note));
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
    "zoning-land-use": evalZoningLandUse,
    "premises-liability": evalPremisesLiability
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
