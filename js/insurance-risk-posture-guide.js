/* =========================================================
   CREdocket — Insurance & Risk Posture Guide page logic
   Renders the static coverage-building-blocks / property-type-
   limits / additional-insured sections from INSURANCE_RISK_
   POSTURE_DATA (js/insurance-risk-posture-guide-data.js), then
   a per-state panel that reads directly from CASE_VALUATION_
   DATA.premisesLiabilityStateModifiers (js/case-valuation-data.js,
   never modified by this file) and translates four already-
   researched fields -- fault rule, negligent-security
   foreseeability test, open-and-obvious rule, and punitive-
   damages standard/cap -- into general insurance-buying
   implications via a fixed, exhaustively-enumerated mapping.
   Every enumerated value actually used in that table is mapped
   below; an unmapped value falls back to a neutral, honest
   default rather than a fabricated translation.
   ========================================================= */

(function () {
  "use strict";
  if (typeof INSURANCE_RISK_POSTURE_DATA === "undefined") return;

  function el(sel) { return document.querySelector(sel); }

  function renderDisclaimer() {
    const d = el("#irp-disclaimer");
    if (d) d.textContent = INSURANCE_RISK_POSTURE_DATA.disclaimer;
  }

  function renderBuildingBlocks() {
    const host = el("#irp-building-blocks");
    if (!host) return;
    host.innerHTML = INSURANCE_RISK_POSTURE_DATA.buildingBlocks.map((b) => `
      <div class="card" style="padding:22px;">
        <h3 style="font-size:14.5px; margin-bottom:8px;">${b.title}</h3>
        <p style="font-size:13px; line-height:1.7; color:var(--text-secondary);">${b.body}</p>
      </div>`).join("");
  }

  function renderPropertyLimits() {
    const host = el("#irp-property-limits");
    if (!host) return;
    host.innerHTML = INSURANCE_RISK_POSTURE_DATA.propertyTypeLimits.map((p) => `
      <div class="card" style="padding:22px;">
        <div class="eyebrow" style="margin-bottom:8px;">${p.label}</div>
        <p style="font-size:13.5px; line-height:1.7; color:var(--text-primary); margin-bottom:10px;"><strong>${p.typical}</strong></p>
        <p style="font-size:12.5px; line-height:1.65; color:var(--text-secondary);">${p.why}</p>
      </div>`).join("");
  }

  function renderRequireList() {
    const host = el("#irp-require-list");
    if (!host) return;
    host.innerHTML = INSURANCE_RISK_POSTURE_DATA.requireFromTenantsAndContractors.map((i) => `<li>${i}</li>`).join("");
  }

  /* ---------- Per-state translation ---------- */

  const FAULT_RULE_IMPLICATIONS = {
    "Pure Contributory": "The most owner-favorable fault rule in the country -- any plaintiff fault at all bars recovery. That doesn't reduce the value of maintaining real coverage (a jury can still find zero comparative fault), but it does mean your claims-handling team has real leverage to litigate rather than reflexively settle borderline claims, which is a claims-strategy conversation worth having with your carrier or TPA, not a reason to under-insure.",
    "Modified Comparative (50% Bar)": "Recovery is barred only if the plaintiff is found 50% or more at fault, otherwise damages are reduced by their fault percentage. Most claims will land somewhere in a reduced-recovery zone rather than an outright bar, which argues for adequate primary CGL limits sized to a realistic reduced-but-still-substantial award, not just the catastrophic tail.",
    "Modified Comparative (51% Bar)": "Recovery is barred only if the plaintiff is found 51% or more at fault -- a marginally more plaintiff-favorable cutoff than the 50%-bar states. Treat it the same way operationally: size primary limits to a realistic reduced award, and rely on umbrella for the tail.",
    "Pure Comparative": "There is no fault percentage that bars recovery outright -- a plaintiff found 90% at fault can still recover the remaining 10%. This generally means more claims proceed to some recovery (even if small), which argues for making sure primary CGL limits aren't so thin that ordinary partial-fault claims routinely blow through them into the umbrella layer.",
    "Slight/Gross (unique -- see note)": "A distinct, narrower fault framework used in only one state (see that state's own note in the Premises Liability Guide for the specific mechanics) -- confirm with coverage counsel how your claims-handling approach should account for it rather than assuming it behaves like an ordinary comparative-fault rule."
  };

  const NEGLIGENT_SECURITY_IMPLICATIONS = {
    "Totality of the Circumstances": "Among the more claimant-friendly foreseeability standards for a crime-on-premises claim -- courts weigh the full fact pattern rather than requiring near-identical prior incidents. If you operate a property with material public access (multifamily, retail, hospitality) here, it's worth confirming with your broker that your CGL doesn't carry a broad assault-and-battery or negligent-security exclusion, and that your umbrella limits were sized with this exposure specifically in mind, not just ordinary slip-and-fall risk.",
    "Prior Similar Incidents": "A stricter, more owner-favorable foreseeability standard -- but it turns entirely on your own documented incident history. That makes your incident-log retention and any prior similar-crime reports at the property directly relevant to underwriting and claims defense, not just a compliance formality.",
    "Balancing Test": "A foreseeability-versus-burden balancing approach (as used, in some form, by a small number of states) -- courts weigh how foreseeable the criminal act was against how burdensome the security measure that would have prevented it would have been. In practice, this means the security measures you actually have in place (lighting, cameras, patrols, access control) are themselves evidence in a future claim, which is worth discussing with your broker alongside coverage limits.",
    "Specific Harm Rule": "The most restrictive, most owner-favorable foreseeability standard -- a plaintiff generally must show the owner knew of the specific, imminent harm. This lowers negligent-security litigation frequency here relative to looser-standard states, but it doesn't eliminate ordinary slip-and-fall or maintenance-hazard exposure, which follows the state's general notice rule instead."
  };

  const OPEN_AND_OBVIOUS_IMPLICATIONS = {
    "Traditional No-Duty Bar": "An obvious hazard generally bars the claim entirely as a matter of law here, which tends to reduce ordinary open-and-obvious slip-and-fall exposure -- but it makes documenting that a hazard actually was open and obvious (photos, inspection logs, timing) central to a successful defense, which is a claims-documentation practice, not an insurance-limits decision.",
    "No-Duty-to-Warn-but-Duty-to-Remedy": "There's no duty to warn of an obvious hazard, but if harm was still foreseeable despite the obviousness, there's a duty to actually fix it. That shifts the practical question from \"did we warn\" to \"did we have a working inspection-and-repair process,\" which is exactly the kind of routine-maintenance discipline underwriters and claims adjusters both look for.",
    "Comparative-Fault-Factor-Only": "Obviousness isn't a bar to the claim at all here -- it's simply one fact the jury weighs in allocating fault. That means more open-and-obvious-hazard claims proceed to a damages question than in no-duty-bar states, which argues for the same primary-limit adequacy point noted under this state's comparative-fault rule above."
  };

  function punitiveTranslation(m) {
    const parts = [];
    if (m.punitiveDamagesStandard) {
      parts.push(`This state's evidentiary standard to recover punitive damages is <strong>${m.punitiveDamagesStandard}</strong>${m.punitiveDamagesCap ? `, with a cap described as: <strong>${m.punitiveDamagesCap}</strong>` : "."}`);
    }
    parts.push("General caution, not a state-specific insurability ruling: many states restrict or flatly prohibit insuring punitive damages as a matter of public policy, and CGL/umbrella policies frequently carry their own punitive-damages exclusion language. Don't assume any layer of your coverage tower will respond to a punitive award without confirming your actual policy language and this state's current rule with coverage counsel — for sizing purposes, treat meaningful punitive exposure as a real, potentially uninsured cost of a bad outcome, not something your umbrella limit already absorbs.");
    return parts.join(" ");
  }

  function stateOptionsHtml(states) {
    return `<option value="">— Select a state —</option>` + states.map((s) => `<option value="${s}">${s}</option>`).join("");
  }

  function renderStatePicker() {
    const select = el("#irp-state");
    const host = el("#irp-state-result");
    if (!select || typeof CASE_VALUATION_DATA === "undefined") return;
    const MODS = CASE_VALUATION_DATA.premisesLiabilityStateModifiers;
    if (!MODS) return;
    const states = Object.keys(MODS).sort();
    select.innerHTML = stateOptionsHtml(states);

    select.addEventListener("change", () => {
      const name = select.value;
      if (!name) { host.innerHTML = ""; return; }
      const m = MODS[name];
      const faultText = FAULT_RULE_IMPLICATIONS[m.faultRule] || "This state's comparative/contributory fault rule wasn't mapped to a specific insurance implication here — see its chapter in the Premises Liability Guide and discuss the fault rule directly with your broker.";
      const secText = NEGLIGENT_SECURITY_IMPLICATIONS[m.negligentSecurityTestNormalized] || "This state's negligent-security foreseeability test wasn't mapped to a specific insurance implication here — see its chapter in the Premises Liability Guide for the underlying rule.";
      const oaoText = OPEN_AND_OBVIOUS_IMPLICATIONS[m.openAndObviousRule] || "This state's open-and-obvious rule wasn't mapped to a specific insurance implication here — see its chapter in the Premises Liability Guide for the underlying rule.";

      host.innerHTML = `
        <div class="card" style="padding:22px; margin-top:16px;">
          <div class="eyebrow" style="margin-bottom:10px;">${name} — Comparative/Contributory Fault (${m.faultRule || "not researched"})</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${faultText}</p>
        </div>
        <div class="card" style="padding:22px; margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:10px;">${name} — Negligent Security / Crime-on-Premises Exposure</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${secText}</p>
        </div>
        <div class="card" style="padding:22px; margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:10px;">${name} — Open &amp; Obvious Hazard Rule</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${oaoText}</p>
        </div>
        <div class="card" style="padding:22px; margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:10px;">${name} — Punitive Damages &amp; Coverage</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.7;">${punitiveTranslation(m)}</p>
        </div>
        <p class="text-muted mt-16" style="font-size:12px;"><a href="premises-liability-guide.html" class="text-accent" style="display:inline;">Read ${name}'s full Premises Liability Guide chapter for the underlying legal analysis and citations →</a></p>
      `;
    });
  }

  renderDisclaimer();
  renderBuildingBlocks();
  renderPropertyLimits();
  renderRequireList();
  renderStatePicker();
})();
