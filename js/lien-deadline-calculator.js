/* =========================================================
   CREdocket — Mechanic's Lien Deadline Calculator logic
   ========================================================= */

(function () {
  "use strict";
  if (typeof LIEN_DEADLINE_DATA === "undefined") return;

  const stateSelect = document.getElementById("ld-state");
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

  function fmtDate(d) {
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d;
  }

  // Does a `requiredFor` string (from the data file) cover the selected
  // role? Values are free text ("sub-supplier (material suppliers only)",
  // "GC and sub-supplier", etc.) rather than an enum, since the exact
  // carve-out varies enough by state that collapsing it to a strict enum
  // would lose real information -- matched by substring instead.
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

  function deadlineCardHtml(label, deadline) {
    // deadline: { computedDate: Date|null, computedFromEstimate: bool,
    // requiredText: string, note: string, citation: string }
    let body;
    if (deadline.notApplicable) {
      body = `<p class="text-muted" style="font-size:13px;">${deadline.notApplicable}</p>`;
    } else if (deadline.computedDate) {
      body = `
        <div class="ld-date">${fmtDate(deadline.computedDate)}</div>
        ${deadline.computedFromEstimate ? `<p class="text-muted" style="font-size:12px; margin-top:4px;">Estimated from the lien-filing deadline above, since no actual/planned filing date was entered — file earlier and this date moves earlier too.</p>` : ""}
      `;
    } else if (deadline.missingDateNote) {
      body = `<p class="text-muted" style="font-size:13px;">${deadline.missingDateNote}</p>`;
    } else {
      body = `<p class="text-secondary" style="font-size:13px; line-height:1.6;">${deadline.ruleText}</p>`;
    }
    return `
      <div class="ld-card card">
        <div class="eyebrow" style="margin-bottom:8px;">${label}</div>
        ${body}
        ${deadline.citation ? `<div class="ld-citation">${deadline.citation}</div>` : ""}
      </div>`;
  }

  function calculate() {
    const stateName = stateSelect.value;
    if (!stateName) {
      resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Select a State</div><p class="text-secondary" style="font-size:13.5px;">Choose a state to calculate deadlines.</p></div>`;
      return;
    }
    const role = roleSelect.value;
    const state = LIEN_DEADLINE_DATA.states[stateName];
    const dates = {
      firstFurnished: firstFurnishedInput.value || null,
      lastFurnished: lastFurnishedInput.value || null,
      completion: completionInput.value || null,
      filed: filedInput.value || null,
    };

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
    prelim.citation = state.citation;

    // ---- Notice of intent to lien ----
    const intent = state.noticeOfIntent.required
      ? { ruleText: "A separate Notice of Intent to Lien is required in this jurisdiction, typically shortly before the lien itself is filed — timing and required content vary by state; confirm with local counsel." }
      : { notApplicable: `${stateName} does not require a separate Notice of Intent to Lien.` };
    intent.citation = state.citation;

    // ---- Lien filing ----
    let filing;
    if (typeof state.lienFiling.days === "number") {
      const trigDate = triggerDate(state.lienFiling.trigger, dates);
      if (!trigDate) {
        const which = state.lienFiling.trigger === "completion" ? "completion date (or last-furnished date)" : "last-furnished date";
        filing = { missingDateNote: `Enter your ${which} above to calculate (due ${state.lienFiling.days} days after).` };
      } else {
        filing = { computedDate: addDays(trigDate, state.lienFiling.days) };
      }
    } else {
      filing = { ruleText: state.lienFiling.note || "This state's lien-filing deadline isn't a simple day-count from one trigger date — see the citation and confirm with local counsel." };
    }
    filing.citation = state.citation;
    if (state.lienFiling.note && typeof state.lienFiling.days === "number") {
      filing.ruleText = state.lienFiling.note; // still show the caveat alongside a computed date, if any
    }

    // ---- Enforcement ----
    let enforcement;
    if (typeof state.enforcement.days === "number") {
      let trigDate = triggerDate(state.enforcement.trigger, dates);
      let estimate = false;
      if (!trigDate && state.enforcement.trigger === "filing" && filing.computedDate) {
        trigDate = filing.computedDate.toISOString().slice(0, 10);
        estimate = true;
      }
      if (!trigDate) {
        enforcement = { missingDateNote: `Enter ${state.enforcement.trigger === "filing" ? "a lien-filed date (or the dates needed to compute your filing deadline)" : "your last-furnished date"} above to calculate.` };
      } else {
        enforcement = { computedDate: addDays(trigDate, state.enforcement.days), computedFromEstimate: estimate };
      }
    } else {
      enforcement = { ruleText: state.enforcement.note || "This state's enforcement deadline isn't a simple day-count — confirm with local counsel." };
    }
    enforcement.citation = state.citation;

    resultsHost.innerHTML = [
      deadlineCardHtml("Preliminary Notice", prelim),
      deadlineCardHtml("Notice of Intent to Lien", intent),
      deadlineCardHtml("Lien Filing / Recording Deadline", filing),
      deadlineCardHtml("Lien Enforcement / Foreclosure Deadline", enforcement),
    ].join("");
    resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  calcBtn.addEventListener("click", calculate);
})();
