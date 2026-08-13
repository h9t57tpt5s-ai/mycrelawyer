/* =========================================================
   CREdocket — Glossary page
   Renders RELAW_DATA.glossary as an alphabetized list, each
   term linking back to the tracked matters, trends, and
   regulatory entries that actually illustrate it.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const list = document.getElementById("glossary-list");
  if (!list) return;

  const items = [...(RELAW_DATA.glossary || [])].sort((a, b) => a.term.localeCompare(b.term));
  const countEl = document.getElementById("glossary-count");
  if (countEl) countEl.textContent = items.length;

  function relatedCasesHtml(ids) {
    if (!ids || !ids.length) return "";
    return ids.map((id) => {
      const c = RELAW_DATA.cases.find((x) => x.id === id);
      if (!c) return "";
      return `<span data-case-id="${c.id}" class="detail-tag" style="cursor:pointer;">${c.title.length > 44 ? c.title.slice(0, 44) + "…" : c.title} ↗</span>`;
    }).join("");
  }

  function relatedOtherHtml(trendIds, regIds) {
    const bits = [];
    if (trendIds && trendIds.length) bits.push(`<a href="trends.html" class="detail-tag">Market Signals ↗</a>`);
    if (regIds && regIds.length) bits.push(`<a href="regulatory.html" class="detail-tag">Regulatory Tracker ↗</a>`);
    return bits.join("");
  }

  function entryHtml(g) {
    const caseLinks = relatedCasesHtml(g.relatedCases);
    const otherLinks = relatedOtherHtml(g.relatedTrends, g.relatedRegulatory);
    const hasLinks = caseLinks || otherLinks;
    return `<div class="glossary-entry reveal" id="${g.id}">
      <h3>${g.term}</h3>
      <p class="text-secondary" style="font-size:14.5px; line-height:1.7; margin-top:8px;">${g.definition}</p>
      ${hasLinks ? `<div class="tag-row mt-16">${caseLinks}${otherLinks}</div>` : ""}
    </div>`;
  }

  list.innerHTML = items.length
    ? items.map(entryHtml).join("")
    : `<p class="text-muted">No glossary terms yet.</p>`;

  list.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));

  // A–Z jump nav
  const jumpNav = document.getElementById("glossary-jump");
  if (jumpNav) {
    const letters = [...new Set(items.map((g) => g.term[0].toUpperCase()))].sort();
    jumpNav.innerHTML = letters.map((l) => {
      const first = items.find((g) => g.term[0].toUpperCase() === l);
      return `<a href="#${first.id}">${l}</a>`;
    }).join("");
  }
})();
