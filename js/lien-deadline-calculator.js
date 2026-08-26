/* =========================================================
   CREdocket — Mechanic's Lien Deadline Calculator logic
   -----------------------------------------------------------
   Two perspectives on the same underlying data:
   - Claimant (contractor/sub/supplier): "what are MY deadlines?"
   - Owner: "what's the LAST day anyone could still file a valid
     lien against my property?" -- computed as the later of the GC
     and subcontractor/supplier lien-filing deadlines, since either
     could still be live and an owner needs the later of the two to
     actually be in the clear.
   ========================================================= */

(function () {
  "use strict";
  if (typeof LIEN_DEADLINE_DATA === "undefined") return;

  const perspectiveSelect = document.getElementById("ld-perspective");
  const stateSelect = document.getElementById("ld-state");
  const roleField = document.getElementById("ld-role-field");
  const roleSelect = document.getElementById("ld-role");
  const firstFurnishedInput = document.getElementById("ld-first-furnished");
  const lastFurnishedInput = document.getElementById("ld-last-furnished");
  const completionInput = document.getElementById("ld-completion");
  const filedInput = document.getElementById("ld-filed");
  const calcBtn = document.getElementById("ld-calculate");
  const resultsHost = document.getElementById("ld-results");
  const disclaimerEl = document.getElementById("ld-disclaimer");
  if (!stateSelect) return;

  disclaimerEl.textContent = LIEN_DEADLINE_DATA.disclaimer;

  Object.keys(LIEN_DEADLINE_DATA.states).sort().forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    stateSelect.appendChild(opt);
  });

  perspectiveSelect.addEventListener("change", () => {
    roleField.style.display = perspectiveSelect.value === "owner" ? "none" : "";
  });

  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d;
  }

  // Does a `requiredFor` string (from the data file) cover the given
  // role? Values are free text ("sub-supplier (material suppliers
  // only)", "GC and sub-supplier", etc.) rather than an enum, since the
  // exact carve-out varies enough by state that collapsing it to a
  // strict enum would lose real information -- matched by substring.
  function appliesToRole(requiredFor, role) {
    if (!requiredFor) return false;
    if (role === "GC") return /\bGC\b/.test(requiredFor);
    return /sub-supplier/.test(requiredFor);
  }

  function triggerDate(trigger, dates) {
    if (trigger === "firstFurnished") return dates.firstFurnished;
    if (trigger === "lastFurnished") return dates.lastFurnished;
    if (trigger === "completion") return dates.completion || dates.lastFurnished;
    if (trigger === "filing") return dates.filed;
    return null;
  }

  // Computes { computedDate, computedFromEstimate, ruleText, missingDateNote }
  // for one role's lien-filing deadline.
  function computeFiling(filingRule, dates) {
    if (typeof filingRule.days === "number") {
      const trigDate = triggerDate(filingRule.trigger, dates);
      if (!trigDate) {
        const which = filingRule.trigger === "completion" ? "completion date (or last-furnished date)" : "last-furnished date";
        return { missingDateNote: `Enter the ${which} above to calculate (due ${filingRule.days} days after).`, ruleNote: filingRule.note };
      }
      return { computedDate: addDays(trigDate, filingRule.days), ruleNote: filingRule.note };
    }
    return { ruleText: filingRule.note || "This deadline isn't a simple day-count from one trigger date — confirm with local counsel." };
  }

  function computeEnforcement(enforcementRule, dates, filingComputed) {
    if (typeof enforcementRule.days === "number") {
      let trigDate = triggerDate(enforcementRule.trigger, dates);
      let estimate = false;
      if (!trigDate && enforcementRule.trigger === "filing" && filingComputed && filingComputed.computedDate) {
        trigDate = filingComputed.computedDate.toISOString().slice(0, 10);
        estimate = true;
      }
      if (!trigDate) {
        return { missingDateNote: `Enter ${enforcementRule.trigger === "filing" ? "a lien-filed date (or the dates needed to compute the filing deadline)" : "the last-furnished date"} above to calculate.` };
      }
      return { computedDate: addDays(trigDate, enforcementRule.days), computedFromEstimate: estimate };
    }
    return { ruleText: enforcementRule.note || "This deadline isn't a simple day-count — confirm with local counsel." };
  }

  function deadlineCardHtml(label, deadline, extraNote) {
    let body;
    if (deadline.notApplicable) {
      body = `<p class="text-muted" style="font-size:13px;">${deadline.notApplicable}</p>`;
    } else if (deadline.computedDate) {
      body = `
        <div class="ld-date">${fmtDate(deadline.computedDate)}</div>
        ${deadline.computedFromEstimate ? `<p class="text-muted" style="font-size:12px; margin-top:4px;">Estimated from the lien-filing deadline, since no actual/planned filing date was entered — an earlier filing moves this earlier too.</p>` : ""}
      `;
    } else if (deadline.missingDateNote) {
      body = `<p class="text-muted" style="font-size:13px;">${deadline.missingDateNote}</p>`;
    } else {
      body = `<p class="text-secondary" style="font-size:13px; line-height:1.6;">${deadline.ruleText}</p>`;
    }
    const note = extraNote || deadline.ruleNote;
    return `
      <div class="ld-card card">
        <div class="eyebrow" style="margin-bottom:8px;">${label}</div>
        ${body}
        ${note ? `<p class="text-muted" style="font-size:12px; margin-top:8px;">${note}</p>` : ""}
      </div>`;
  }

  function claimantResults(stateName, state, role, dates) {
    // ---- Preliminary notice ----
    let prelim;
    if (!appliesToRole(state.prelimNotice.requiredFor, role)) {
      prelim = { notApplicable: state.prelimNotice.requiredFor
        ? `Not required for your selected role in ${stateName} — required only for ${state.prelimNotice.requiredFor}.`
        : `${stateName} does not require preliminary notice on commercial private projects.` };
    } else if (typeof state.prelimNotice.days === "number") {
      if (!dates.firstFurnished) {
        prelim = { missingDateNote: `Required — enter your first-furnished date above to calculate (due within ${state.prelimNotice.days} days of first furnishing).` };
      } else {
        prelim = { computedDate: addDays(dates.firstFurnished, state.prelimNotice.days) };
      }
    } else {
      prelim = { ruleText: state.prelimNotice.note || `Required for ${state.prelimNotice.requiredFor} in ${stateName}, but the exact deadline isn't a simple day-count from one trigger date — confirm the specific rule with local counsel.` };
    }

    // ---- Notice of intent to lien ----
    const intent = state.noticeOfIntent.required
      ? { ruleText: "A separate Notice of Intent to Lien is required in this jurisdiction, typically shortly before the lien itself is filed — timing and required content vary by state; confirm with local counsel." }
      : { notApplicable: `${stateName} does not require a separate Notice of Intent to Lien.` };

    // ---- Lien filing ----
    const roleKey = role === "GC" ? "gc" : "subSupplier";
    const filing = computeFiling(state.lienFiling[roleKey], dates);

    // ---- Enforcement ----
    const enforcement = computeEnforcement(state.enforcement[roleKey], dates, filing);

    return [
      deadlineCardHtml("Preliminary Notice", prelim, state.citation),
      deadlineCardHtml("Notice of Intent to Lien", intent, state.citation),
      deadlineCardHtml("Lien Filing / Recording Deadline", filing, filing.ruleNote ? `${filing.ruleNote} ${state.citation}` : state.citation),
      deadlineCardHtml("Lien Enforcement / Foreclosure Deadline", enforcement, state.citation),
    ].join("");
  }

  function ownerResults(stateName, state, dates) {
    const gcFiling = computeFiling(state.lienFiling.gc, dates);
    const subFiling = computeFiling(state.lienFiling.subSupplier, dates);

    let headline;
    if (gcFiling.computedDate && subFiling.computedDate) {
      const latest = gcFiling.computedDate > subFiling.computedDate ? gcFiling.computedDate : subFiling.computedDate;
      headline = `
        <div class="ld-card card ld-owner-headline">
          <div class="eyebrow" style="margin-bottom:8px;">Last Day a Lien Could Still Be Filed</div>
          <div class="ld-date ld-date-lg">${fmtDate(latest)}</div>
          <p class="text-secondary" style="font-size:13px; margin-top:8px; line-height:1.6;">The later of the general/prime contractor and subcontractor/supplier lien-filing deadlines below — either could still be a live claimant, so the later date is when you're actually in the clear.</p>
        </div>`;
    } else {
      const gap = !gcFiling.computedDate && !subFiling.computedDate
        ? "Neither the GC nor the subcontractor/supplier lien-filing deadline reduces to a simple computed date in this state (see both below) — there is no single \"safe after\" date this calculator can give you here."
        : "One of the two lien-filing deadlines below isn't a simple computed date in this state — do not treat the computed one alone as the date you're in the clear.";
      headline = `
        <div class="gate-card is-error">
          <div class="eyebrow" style="margin-bottom:8px;">No Single Computed Date</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.6;">${gap}</p>
        </div>`;
    }

    return headline + [
      deadlineCardHtml("General/Prime Contractor — Lien Filing Deadline", gcFiling, gcFiling.ruleNote ? `${gcFiling.ruleNote} ${state.citation}` : state.citation),
      deadlineCardHtml("Subcontractor/Supplier — Lien Filing Deadline", subFiling, subFiling.ruleNote ? `${subFiling.ruleNote} ${state.citation}` : state.citation),
    ].join("");
  }

  function calculate() {
    const stateName = stateSelect.value;
    if (!stateName) {
      resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Select a State</div><p class="text-secondary" style="font-size:13.5px;">Choose a state to calculate deadlines.</p></div>`;
      return;
    }
    const state = LIEN_DEADLINE_DATA.states[stateName];
    const dates = {
      firstFurnished: firstFurnishedInput.value || null,
      lastFurnished: lastFurnishedInput.value || null,
      completion: completionInput.value || null,
      filed: filedInput.value || null,
    };

    resultsHost.innerHTML = perspectiveSelect.value === "owner"
      ? ownerResults(stateName, state, dates)
      : claimantResults(stateName, state, roleSelect.value, dates);
    resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  calcBtn.addEventListener("click", calculate);
})();
