/* =========================================================
   CREdocket — Algorithmic Pricing: A Manager's Guide page logic
   -----------------------------------------------------------
   Renders the five real, already-tracked RealPage-adjacent
   matters this page discusses by looking them up, by id, directly
   from RELAW_DATA.cases (js/data.js, never modified by this
   file) -- so the quoted significance text can never drift from
   the tracker's own record of that matter. If a case id isn't
   found (e.g. this file runs before js/data.js loads, or a future
   edit renumbers ids), that matter's card is simply omitted
   rather than showing fabricated text.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  // The real tracked matters this page's guidance is grounded in --
  // see js/data.js for the full record of each.
  const MATTER_IDS = ["live-001", "live-014", "live-062", "live-069", "live-022"];

  function findCase(id) {
    return RELAW_DATA.cases.find((c) => c.id === id) || null;
  }

  function formatDate(iso) {
    if (window.RELAW_UTILS && window.RELAW_UTILS.formatDate) return window.RELAW_UTILS.formatDate(iso);
    return iso;
  }

  function matterCardHtml(c) {
    return `
      <div class="card" style="padding:22px; margin-bottom:16px;">
        <div class="eyebrow" style="margin-bottom:8px;">${c.jurisdiction} — ${formatDate(c.date)}</div>
        <h3 style="font-size:15px; margin-bottom:10px;">${c.title}</h3>
        <p style="font-size:13.5px; line-height:1.75; color:var(--text-secondary); margin-bottom:12px;">${c.significance || c.summary}</p>
        <a href="litigation.html?case=${c.id}" class="btn btn-ghost btn-sm">Read the full matter &#8599;</a>
      </div>`;
  }

  function render() {
    const host = document.getElementById("apm-matters");
    if (!host) return;
    const html = MATTER_IDS.map(findCase).filter(Boolean).map(matterCardHtml).join("");
    host.innerHTML = html || `<p class="text-secondary">Tracked matters are temporarily unavailable — see the <a href="litigation.html?q=RealPage">Litigation Tracker</a> directly.</p>`;
  }

  render();
})();
