/* =========================================================
   CREdocket -- Case Value Estimator: calculation engine
   A transparent, rules-based expected-value model -- not a black-box
   prediction. Every probability/damages range is driven by either
   (a) the specific state-law modifier from the verified handbook data,
   or (b) a user-entered fact, or (c) a comparable-case-informed default.
   Nothing here claims statistical certainty; everything is a range.
   ========================================================= */

window.CV_ENGINE = (function () {
  "use strict";

  function mid(range) {
    return (range[0] + range[1]) / 2;
  }
  function money(n) {
    return Math.round(n);
  }
  function rangeMul(range, scalar) {
    return [range[0] * scalar, range[1] * scalar];
  }
  function clampRange(range) {
    return [Math.max(0, Math.min(range[0], range[1])), Math.max(0, Math.max(range[0], range[1]))];
  }

  function pickCitations(claimKey, stateName) {
    const pool = (window.CV_CITATIONS && window.CV_CITATIONS[claimKey]) || [];
    if (!pool.length) return [];
    const stateAbbr = (window.CV_STATE_ABBR && window.CV_STATE_ABBR[stateName]) || null;
    const matches = stateAbbr ? pool.filter((c) => c.jurisdiction === stateAbbr) : [];
    const chosen = (matches.length ? matches : pool).slice(0, 2);
    return chosen.map((c) => {
      const amt = c.dollarAmount ? ` (${Math.round(c.dollarAmount).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })})` : "";
      return { label: `${c.caseName}${amt}`, url: c.url || "#" };
    });
  }

  // ---- Per-claim evaluators. Each returns null if not applicable, or
  // { key, label, side, probabilityRange, damagesRange, expectedRange, why, citations } ----

  function evalUnpaidRent(a) {
    if (!(a.unpaidRentAmount > 0)) return null;
    let prob = [0.90, 0.97];
    let why = "Accrued, undisputed rent under a written lease is close to open-and-shut in nearly every jurisdiction.";
    if (a.tenantDisputesDebt) {
      prob = [0.55, 0.75];
      why = "The tenant disputes this debt (e.g., claims an offset or abatement), which meaningfully lowers the probability of full recovery without a contested hearing.";
    } else if (a.hasWrittenLease === false) {
      prob = [0.40, 0.60];
      why = "No written lease on file weakens proof of the rent obligation's exact terms.";
    }
    const damages = [a.unpaidRentAmount, a.unpaidRentAmount];
    return {
      key: "unpaid_rent", label: "Unpaid Rent", side: "landlord",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: rangeMul(damages, 1).map((d, i) => d * prob[i]),
      why, citations: pickCitations("unpaid_rent", a.state),
    };
  }

  function evalAcceleratedRent(a, stateMod) {
    if (!(a.leaseTerminated && a.remainingMonths > 0 && a.monthlyRent > 0)) return null;
    let prob = [0.65, 0.90];
    let why = "An acceleration clause was confirmed in the lease, and courts in this state generally enforce properly drafted acceleration provisions.";
    if (a.hasAccelerationClause !== true) {
      prob = [0.15, 0.30];
      why = "No confirmed acceleration clause -- without one, courts are reluctant to award the full remaining-term rent as a lump sum.";
    }
    let base = a.remainingMonths * a.monthlyRent;
    let damages = [base, base];
    let mitigationNote = "";
    if (a.landlordRelet && typeof a.reletMonthlyRent === "number") {
      const offsetPerMonth = Math.max(0, a.reletMonthlyRent);
      const offsetTotal = offsetPerMonth * a.remainingMonths;
      damages = [Math.max(0, base - offsetTotal), Math.max(0, base - offsetTotal)];
      mitigationNote = ` The premises were re-let at $${offsetPerMonth.toLocaleString()}/mo, which is credited against the claim.`;
    } else {
      const duty = stateMod ? stateMod.mitigationDuty : "Unclear";
      const offsetRange = duty === "Yes" ? [0.30, 0.50] : duty === "No" ? [0.00, 0.05] : [0.15, 0.35];
      damages = [base * (1 - offsetRange[1]), base * (1 - offsetRange[0])];
      mitigationNote = duty === "Yes"
        ? " This state imposes a duty to mitigate, so the raw remaining-term figure is discounted for a plausible re-letting recovery."
        : duty === "No"
        ? " This state does not impose a duty to mitigate, so little discount is applied."
        : " This state's mitigation duty is not clearly established in our research, so a moderate discount is applied -- confirm locally.";
    }
    return {
      key: "accelerated_rent", label: "Accelerated / Future Rent", side: "landlord",
      probabilityRange: prob, damagesRange: clampRange(damages),
      expectedRange: [clampRange(damages)[0] * prob[0], clampRange(damages)[1] * prob[1]],
      why: why + mitigationNote, citations: pickCitations("accelerated_rent", a.state),
    };
  }

  function evalHoldover(a, stateMod) {
    if (!(a.heldOverAfterTerm && a.holdoverMonths > 0 && stateMod && stateMod.holdoverStatutoryPenalty)) return null;
    const prob = [0.80, 0.95];
    const multiplier = 2; // conservative default (double rent) -- many statutes use 2x, some 3x; refine per-state from comparable research
    const base = a.monthlyRent * multiplier * a.holdoverMonths;
    const damages = [base, base * 1.5]; // upper bound allows for states using a 3x multiplier
    return {
      key: "holdover_damages", label: "Statutory Holdover Damages", side: "landlord",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why: "This state imposes a statutory penalty (typically double or treble rent) on a commercial tenant who holds over after the lease term expires. Confirm the exact multiplier in the state's chapter of the Commercial Eviction Handbook before relying on the high end of this range.",
      citations: pickCitations("holdover_damages", a.state),
    };
  }

  function evalPropertyDamage(a) {
    if (!(a.propertyDamageAmount > 0)) return null;
    const prob = [0.70, 0.90];
    const haircut = [0.10, 0.20];
    const damages = [a.propertyDamageAmount * (1 - haircut[1]), a.propertyDamageAmount * (1 - haircut[0])];
    return {
      key: "property_damage", label: "Property Damage / Repairs", side: "landlord",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why: "Property-damage claims are usually provable with inspection/photo evidence, but a portion is typically attributed to normal wear and tear rather than tenant-caused damage.",
      citations: [],
    };
  }

  function evalWrongfulLockout(a, stateMod) {
    if (!a.selfHelpUsedAgainstTenant) return null;
    let prob;
    let why;
    const avail = stateMod ? stateMod.selfHelpAvailable : "See chapter";
    if (avail === "Not Available") {
      prob = [0.85, 0.95];
      why = "Self-help is not an available remedy in this state at all, so a landlord's lockout is very likely to be found unlawful.";
    } else if (avail === "Uncertain") {
      prob = [0.30, 0.60];
      why = "Our verified research found this state's law on commercial self-help genuinely unsettled -- this range reflects that uncertainty, and confirming current local guidance matters more than usual here.";
    } else if (a.processFollowedByLandlord === true) {
      prob = [0.10, 0.25];
      why = "Self-help is available on these facts and the landlord appears to have followed the required statutory process, so the lockout is more likely to be found lawful.";
    } else {
      prob = [0.60, 0.80];
      why = "Self-help is conditionally available in this state, but the required statutory process does not appear to have been followed correctly, which favors the tenant's claim.";
    }
    const actual = (a.lostProfitsEstimate || 0) + (a.relocationCostEstimate || 0);
    const damages = actual > 0 ? [actual * 0.6, actual] : [5000, 25000]; // fallback placeholder range when no facts entered
    return {
      key: "wrongful_lockout", label: "Wrongful Eviction / Unlawful Lockout", side: "tenant",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why, citations: pickCitations("wrongful_lockout", a.state),
    };
  }

  function evalQuietEnjoyment(a) {
    if (!a.repairFailureClaimed) return null;
    let prob = [0.40, 0.65];
    let why = "Failure-to-repair and interference claims are fact-intensive and generally harder to prove than a clean self-help violation.";
    if (a.gaveCureNotice) {
      prob = [0.50, 0.80];
      why += " Having given the landlord notice and an opportunity to cure strengthens the claim.";
    }
    let lost = a.lostProfitsEstimate || 0;
    if (a.leaseWaivesConsequentialDamages === true) {
      lost = 0;
      why += " Note: the lease appears to waive consequential damages, which likely bars a lost-profits component -- zeroed out here.";
    }
    const damages = lost > 0 ? [lost * 0.4, lost * 0.8] : [3000, 15000];
    return {
      key: "quiet_enjoyment_breach", label: "Breach of Quiet Enjoyment / Constructive Eviction / Failure to Repair", side: "tenant",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why, citations: pickCitations("quiet_enjoyment_breach", a.state),
    };
  }

  function evalSecurityDeposit(a) {
    if (!(a.depositAmount > 0 && a.depositDisputed)) return null;
    let prob = [0.55, 0.80];
    let why = "Most states do not have a specific commercial-security-deposit statute (unlike residential), so this is primarily a lease-interpretation question rather than a statutory one.";
    if (a.depositItemized === false) {
      prob = [0.65, 0.85];
      why += " The landlord did not provide an itemized accounting, which generally favors the tenant.";
    }
    const damages = [a.depositAmount, a.depositAmount];
    return {
      key: "security_deposit", label: "Wrongfully Withheld Security Deposit", side: "tenant",
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why, citations: pickCitations("security_deposit", a.state),
    };
  }

  function evalAttorneyFees(a, otherClaims) {
    if (!a.hasFeeShiftingClause) return null;
    if (!otherClaims.length) return null;
    const weighted = otherClaims.reduce((s, c) => s + mid(c.probabilityRange), 0) / otherClaims.length;
    const prob = [Math.max(0, weighted - 0.1), Math.min(1, weighted + 0.05)];
    const principal = otherClaims.reduce((s, c) => s + mid(c.expectedRange), 0);
    const feeRatio = [0.15, 0.40];
    const damages = rangeMul(feeRatio, 1).map((r) => principal * r);
    const side = otherClaims[0].side; // fees generally follow the side pursuing the claims
    return {
      key: "attorney_fees", label: "Attorney's Fees", side,
      probabilityRange: prob, damagesRange: damages,
      expectedRange: [damages[0] * prob[0], damages[1] * prob[1]],
      why: "The lease has a contractual fee-shifting clause. Fee awards typically track success on the underlying claims and are estimated here as a percentage of the other claims' expected value -- a rough heuristic, not a fixed ratio found in law.",
      citations: pickCitations("attorney_fees", a.state),
    };
  }

  function calculate(answers) {
    const stateMod = (CV_STATE_MODIFIERS || {})[answers.state] || null;
    const claims = [];

    if (answers.role === "landlord") {
      [evalUnpaidRent(answers), evalAcceleratedRent(answers, stateMod), evalHoldover(answers, stateMod), evalPropertyDamage(answers)]
        .forEach((c) => c && claims.push(c));
    } else {
      [evalWrongfulLockout(answers, stateMod), evalQuietEnjoyment(answers), evalSecurityDeposit(answers)]
        .forEach((c) => c && claims.push(c));
    }

    const feeClaim = evalAttorneyFees(answers, claims.slice());
    if (feeClaim) claims.push(feeClaim);

    const totalLow = claims.reduce((s, c) => s + c.expectedRange[0], 0);
    const totalHigh = claims.reduce((s, c) => s + c.expectedRange[1], 0);

    return {
      claims,
      totalRange: [money(totalLow), money(totalHigh)],
      role: answers.role,
      state: answers.state,
      stateModifiers: stateMod,
    };
  }

  return { calculate, mid, money };
})();
