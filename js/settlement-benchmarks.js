/* =========================================================
   CREdocket — Settlement & Verdict Benchmark search
   -----------------------------------------------------------
   Flattens the same citation database that backs the Case Value
   Calculator (CASE_VALUATION_DATA.citations, keyed by claim
   type) into one searchable, filterable list -- no new data, just a
   different lens on data that already exists and is already real
   and cited, unlike a generic AI query with nothing to ground it.
   ========================================================= */

(function () {
  "use strict";

  function fmtMoney(n) {
    if (typeof n !== "number") return null;
    return n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US");
  }

  function buildIndex() {
    // CASE_VALUATION_DATA is a top-level `const` in case-valuation-data.js
    // (a classic script, not a module) -- that never attaches to
    // `window`, only `typeof` against the bare identifier is safe before
    // checking it's actually there.
    if (typeof CASE_VALUATION_DATA === "undefined") return [];
    const data = CASE_VALUATION_DATA;
    if (!data || !data.citations) return [];
    const claimMeta = {};
    Object.entries(data.spec.categories || {}).forEach(([catSlug, cat]) => {
      Object.entries(cat.claimTypes || {}).forEach(([claimKey, claim]) => {
        claimMeta[claimKey] = { categorySlug: catSlug, categoryLabel: cat.label, claimLabel: claim.label || claimKey };
      });
    });
    const rows = [];
    Object.entries(data.citations).forEach(([claimKey, entries]) => {
      const meta = claimMeta[claimKey] || { categorySlug: "other", categoryLabel: "Other", claimLabel: claimKey };
      (entries || []).forEach((cit) => {
        if (!cit || !cit.caseName) return;
        rows.push(Object.assign({ claimKey, categorySlug: meta.categorySlug, categoryLabel: meta.categoryLabel, claimLabel: meta.claimLabel }, cit));
      });
    });
    return rows;
  }

  function cardHtml(row) {
    const amount = fmtMoney(row.dollarAmount);
    const nameHtml = row.sourceUrl
      ? `<a href="${row.sourceUrl}" target="_blank" rel="noopener">${row.caseName}</a>`
      : row.caseName;
    return `
      <div class="sb-card card">
        <div class="sb-card-top">
          <h3>${nameHtml}</h3>
          ${amount ? `<div class="sb-amount">${amount}</div>` : ""}
        </div>
        ${row.citation ? `<div class="sb-citation">${row.citation}</div>` : ""}
        <div class="sb-tags">
          <span class="detail-tag">${row.categoryLabel}</span>
          <span class="detail-tag">${row.claimLabel}</span>
          ${row.jurisdiction ? `<span class="detail-tag">${row.jurisdiction}</span>` : ""}
          ${row.year ? `<span class="detail-tag">${row.year}</span>` : ""}
          ${row.confidence ? `<span class="detail-tag sb-confidence sb-confidence-${row.confidence}">${row.confidence} confidence</span>` : ""}
        </div>
        ${row.outcome ? `<p class="sb-outcome">${row.outcome}</p>` : ""}
      </div>`;
  }

  document.addEventListener("DOMContentLoaded", init);
  // If DOMContentLoaded already fired (script loaded late), init runs
  // immediately instead of waiting forever for an event that already
  // happened -- this file is loaded at the end of body, so that's the
  // common case, not an edge case.
  if (document.readyState !== "loading") init();

  let inited = false;
  function init() {
    if (inited) return;
    inited = true;

    const listEl = document.getElementById("sb-list");
    const searchEl = document.getElementById("sb-search");
    const categoryEl = document.getElementById("sb-category");
    const jurisdictionEl = document.getElementById("sb-jurisdiction");
    const sortEl = document.getElementById("sb-sort");
    const countEl = document.getElementById("sb-results-count");
    const clearBtn = document.getElementById("sb-clear");
    if (!listEl) return;

    const allRows = buildIndex();

    if (!allRows.length) {
      listEl.innerHTML = `<div class="empty-state"><p>Benchmark data isn't available right now — try again shortly.</p></div>`;
      return;
    }

    // Populate filter options from the actual data rather than a fixed
    // list, so this never drifts out of sync with what's really there.
    const categories = [...new Map(allRows.map((r) => [r.categorySlug, r.categoryLabel])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    categories.forEach(([slug, label]) => {
      const opt = document.createElement("option");
      opt.value = slug; opt.textContent = label;
      categoryEl.appendChild(opt);
    });
    const jurisdictions = [...new Set(allRows.map((r) => r.jurisdiction).filter(Boolean))].sort();
    jurisdictions.forEach((j) => {
      const opt = document.createElement("option");
      opt.value = j; opt.textContent = j;
      jurisdictionEl.appendChild(opt);
    });

    function render() {
      const q = searchEl.value.trim().toLowerCase();
      const cat = categoryEl.value;
      const jur = jurisdictionEl.value;
      const sort = sortEl.value;

      let rows = allRows.filter((r) => {
        if (cat !== "all" && r.categorySlug !== cat) return false;
        if (jur !== "all" && r.jurisdiction !== jur) return false;
        if (q) {
          const hay = `${r.caseName} ${r.outcome || ""} ${r.claimLabel}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      rows = rows.slice().sort((a, b) => {
        if (sort === "amount-desc") return (b.dollarAmount || 0) - (a.dollarAmount || 0);
        if (sort === "amount-asc") return (a.dollarAmount || 0) - (b.dollarAmount || 0);
        if (sort === "year-asc") return (a.year || 0) - (b.year || 0);
        return (b.year || 0) - (a.year || 0); // year-desc, default
      });

      countEl.textContent = `${rows.length} of ${allRows.length} cited outcome${allRows.length === 1 ? "" : "s"}`;
      listEl.innerHTML = rows.length
        ? rows.map(cardHtml).join("")
        : `<div class="empty-state"><p>No cited outcomes match these filters.</p></div>`;
    }

    [searchEl, categoryEl, jurisdictionEl, sortEl].forEach((el) => {
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    clearBtn.addEventListener("click", () => {
      searchEl.value = "";
      categoryEl.value = "all";
      jurisdictionEl.value = "all";
      sortEl.value = "amount-desc";
      render();
    });

    render();
  }
})();
