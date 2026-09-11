/* =========================================================
   CREdocket — Settlement & Verdict Benchmark search
   -----------------------------------------------------------
   The citation database this page searches (403 real, individually
   cited settlement/verdict outcomes) used to ship as part of the
   public js/case-valuation-data.js static file -- anyone could
   download the entire proprietary research database in one request.
   It now lives in a private Supabase table, readable only by a
   service-role Edge Function (settlement-benchmarks-search). This file
   still reads js/case-valuation-data.js, but ONLY for `spec` (category
   labels) -- the `citations` key is gone from that file by design, and
   every actual case lookup now goes through the Edge Function, which
   redacts the dollar amount, source link, and outcome/notes for anyone
   who isn't signed in. Anonymous browsing is fully supported and not an
   error state -- it's the free, no-signup-required lead-gen path this
   page exists for; signing in just unlocks the full cited record.
   ========================================================= */

(function () {
  "use strict";

  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const SEARCH_FN_URL = SUPABASE_URL + "/functions/v1/settlement-benchmarks-search";
  const SEARCH_DEBOUNCE_MS = 300; // only the free-text field debounces -- each keystroke would otherwise fire a network request

  function fmtMoney(n) {
    if (typeof n !== "number") return null;
    return n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US");
  }

  // Category labels only -- CASE_VALUATION_DATA is a top-level `const` in
  // case-valuation-data.js (a classic script, not a module) that never
  // attaches to `window`, so only `typeof` against the bare identifier is
  // safe before checking it's actually there. The trimmed public file
  // still ships `spec`; it no longer ships `citations` at all.
  function categoryOptions() {
    if (typeof CASE_VALUATION_DATA === "undefined" || !CASE_VALUATION_DATA.spec) return [];
    return Object.entries(CASE_VALUATION_DATA.spec.categories || {})
      .map(([slug, cat]) => [slug, cat.label])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }

  function lockedCardHtml(row) {
    return `
      <div class="sb-card card is-locked">
        <div class="sb-card-top">
          <h3>${row.caseName}</h3>
        </div>
        <div class="sb-tags">
          ${row.jurisdiction ? `<span class="detail-tag">${row.jurisdiction}</span>` : ""}
          ${row.year ? `<span class="detail-tag">${row.year}</span>` : ""}
          ${row.confidence ? `<span class="detail-tag sb-confidence sb-confidence-${row.confidence}">${row.confidence} confidence</span>` : ""}
        </div>
        <div class="gate-card sb-gate-card">
          <p class="text-secondary" style="font-size:13px; margin:0;">Sign in free to see the verified amount and source →</p>
          <button type="button" class="btn btn-primary btn-sm sb-signin-btn">Sign in to continue</button>
        </div>
      </div>`;
  }

  function fullCardHtml(row) {
    const amount = fmtMoney(row.dollarAmount);
    const nameHtml = row.url
      ? `<a href="${row.url}" target="_blank" rel="noopener">${row.caseName}</a>`
      : row.caseName;
    return `
      <div class="sb-card card">
        <div class="sb-card-top">
          <h3>${nameHtml}</h3>
          ${amount ? `<div class="sb-amount">${amount}</div>` : ""}
        </div>
        ${row.citation ? `<div class="sb-citation">${row.citation}</div>` : ""}
        <div class="sb-tags">
          ${row.categoryLabel ? `<span class="detail-tag">${row.categoryLabel}</span>` : ""}
          ${row.claimLabel ? `<span class="detail-tag">${row.claimLabel}</span>` : ""}
          ${row.jurisdiction ? `<span class="detail-tag">${row.jurisdiction}</span>` : ""}
          ${row.year ? `<span class="detail-tag">${row.year}</span>` : ""}
          ${row.confidence ? `<span class="detail-tag sb-confidence sb-confidence-${row.confidence}">${row.confidence} confidence</span>` : ""}
        </div>
        ${row.outcome ? `<p class="sb-outcome">${row.outcome}</p>` : ""}
      </div>`;
  }

  function cardHtml(row) {
    return row.locked ? lockedCardHtml(row) : fullCardHtml(row);
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

    const sb = window.RELAW_SUPABASE;

    categoryOptions().forEach(([slug, label]) => {
      const opt = document.createElement("option");
      opt.value = slug; opt.textContent = label;
      categoryEl.appendChild(opt);
    });

    let jurisdictionsPopulated = false;
    function populateJurisdictions(rows) {
      if (jurisdictionsPopulated) return;
      const jurisdictions = [...new Set(rows.map((r) => r.jurisdiction).filter(Boolean))].sort();
      if (!jurisdictions.length) return; // try again on a later, less-filtered response
      jurisdictions.forEach((j) => {
        const opt = document.createElement("option");
        opt.value = j; opt.textContent = j;
        jurisdictionEl.appendChild(opt);
      });
      jurisdictionsPopulated = true;
    }

    async function authHeaderIfSignedIn() {
      if (!sb) return {};
      try {
        const { data: { session } } = await sb.auth.getSession();
        return session ? { Authorization: `Bearer ${session.access_token}` } : {};
      } catch {
        return {};
      }
    }

    let requestSeq = 0; // guards against an older, slower request clobbering a newer one's result
    async function render() {
      const q = searchEl.value.trim();
      const cat = categoryEl.value;
      const jur = jurisdictionEl.value;
      const sort = sortEl.value;
      const seq = ++requestSeq;

      countEl.textContent = "Searching…";
      const authHeader = await authHeaderIfSignedIn();
      if (seq !== requestSeq) return;

      let json;
      try {
        const resp = await fetch(SEARCH_FN_URL, {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
            authHeader
          ),
          body: JSON.stringify({
            category: cat === "all" ? undefined : cat,
            jurisdiction: jur === "all" ? undefined : jur,
            keyword: q || undefined,
            sort,
          }),
        });
        json = await resp.json().catch(() => null);
        if (!resp.ok || !json) throw new Error((json && json.error) || `Request failed (${resp.status})`);
      } catch (err) {
        if (seq !== requestSeq) return;
        countEl.textContent = "";
        listEl.innerHTML = `<div class="empty-state"><p>Benchmark data isn't available right now — try again shortly.</p></div>`;
        return;
      }
      if (seq !== requestSeq) return; // a newer request already landed

      const rows = Array.isArray(json.results) ? json.results : [];
      populateJurisdictions(rows);

      const total = typeof json.total === "number" ? json.total : rows.length;
      countEl.textContent = `${total} matching case${total === 1 ? "" : "s"}` +
        (json.signedIn ? "" : total ? " — sign in free to see amounts and sources" : "");
      listEl.innerHTML = rows.length
        ? rows.map(cardHtml).join("")
        : `<div class="empty-state"><p>No cited outcomes match these filters.</p></div>`;

      listEl.querySelectorAll(".sb-signin-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (window.RELAW_AUTH) window.RELAW_AUTH.openSignInModal();
        });
      });
    }

    let debounceTimer = null;
    function renderDebounced() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(render, SEARCH_DEBOUNCE_MS);
    }

    searchEl.addEventListener("input", renderDebounced);
    [categoryEl, jurisdictionEl, sortEl].forEach((el) => el.addEventListener("change", render));
    clearBtn.addEventListener("click", () => {
      searchEl.value = "";
      categoryEl.value = "all";
      jurisdictionEl.value = "all";
      sortEl.value = "amount-desc";
      render();
    });

    // Re-run the current search if sign-in state changes (e.g. the visitor
    // signs in from the gate prompt above without leaving the page) so
    // locked cards unlock immediately rather than only on the next filter change.
    if (sb) {
      sb.auth.onAuthStateChange(() => render());
    }

    render();
  }
})();
