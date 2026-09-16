/* =========================================================
   CREdocket — Settlement & Verdict Benchmarks page logic
   -----------------------------------------------------------
   Thin client over the settlement-benchmarks-search Edge Function (see
   supabase/functions/settlement-benchmarks-search/index.ts for the full
   request/response contract). That function is the ONLY server-side path
   to CREdocket's proprietary, individually-verified settlement/verdict
   citation database -- the raw data itself lives in a service-role-only
   table and is never shipped to the client, signed in or not.

   Anonymous visitors get real case names, jurisdictions, years, and
   confidence tiers (enough to see the research is real and substantial)
   with dollar amount, source link, and outcome notes locked -- a
   legitimate lead-gen hook, not a degraded error state. Signed-in users
   get the full record. Sign-in state is read the same way
   case-valuation.js does (sb.auth.getSession()), and a missing/expired
   session is just treated as anonymous -- this endpoint has no "you must
   sign in" failure mode.
   ========================================================= */

(function () {
  "use strict";

  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const BENCHMARKS_FN_URL = SUPABASE_URL + "/functions/v1/settlement-benchmarks-search";

  const sb = window.RELAW_SUPABASE;
  const resultsHost = document.getElementById("sb-results-host");
  const countHost = document.getElementById("sb-result-count");
  const keywordInput = document.getElementById("sb-keyword");
  const categorySelect = document.getElementById("sb-category");
  const jurisdictionSelect = document.getElementById("sb-jurisdiction");
  const sortSelect = document.getElementById("sb-sort");
  const clearBtn = document.getElementById("sb-clear");

  if (!resultsHost) return; // not on this page

  const fmt = (n) => (typeof n !== "number" ? null : "$" + Math.round(n).toLocaleString("en-US"));

  // ---- Populate category/jurisdiction dropdowns from the same source of
  // truth the backend classifier uses (CASE_VALUATION_DATA.spec.categories,
  // js/case-valuation-data.js) and the site-wide state map (RELAW_DATA.states)
  // -- never a separate hand-typed list, so this can't drift the way the
  // calculator's own category count already has once. ----
  function populateFilters() {
    if (typeof CASE_VALUATION_DATA !== "undefined" && CASE_VALUATION_DATA.spec && CASE_VALUATION_DATA.spec.categories) {
      Object.entries(CASE_VALUATION_DATA.spec.categories).forEach(([slug, cat]) => {
        const opt = document.createElement("option");
        opt.value = slug;
        opt.textContent = cat.label || slug;
        categorySelect.appendChild(opt);
      });
    }
    if (typeof RELAW_DATA !== "undefined" && RELAW_DATA.states) {
      Object.entries(RELAW_DATA.states).forEach(([code, name]) => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = name;
        jurisdictionSelect.appendChild(opt);
      });
    }
  }

  function lockedRowHtml(r) {
    return `
      <div class="card sb-row">
        <div class="sb-row-top">
          <h4 style="filter:blur(3px); user-select:none;">${r.caseName || "Case name hidden"}</h4>
          <span class="detail-tag" title="Confidence in this citation's sourcing">${r.confidence || "—"} confidence</span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
          <span class="detail-tag">${r.jurisdiction || "—"}</span>
          <span class="detail-tag">${r.year || "—"}</span>
          <span class="detail-tag" style="color:var(--ui-warning); border-color:var(--ui-warning);">Amount &amp; source locked</span>
        </div>
      </div>`;
  }

  function fullRowHtml(r) {
    const amount = fmt(r.dollarAmount);
    return `
      <div class="card sb-row">
        <div class="sb-row-top">
          <h4>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">${r.caseName}</a>` : r.caseName}${r.year ? ` (${r.year})` : ""}</h4>
          ${amount ? `<span class="sb-amount">${amount}</span>` : ""}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
          ${r.categoryLabel ? `<span class="detail-tag">${r.categoryLabel}</span>` : ""}
          ${r.claimLabel ? `<span class="detail-tag">${r.claimLabel}</span>` : ""}
          <span class="detail-tag">${r.jurisdiction || "—"}</span>
          ${r.confidence ? `<span class="detail-tag" title="Confidence in this citation's sourcing">${r.confidence} confidence</span>` : ""}
        </div>
        ${r.outcome ? `<p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-top:10px;">${r.outcome}</p>` : ""}
        ${r.notes ? `<p class="text-muted" style="font-size:12.5px; line-height:1.6; margin-top:6px;">${r.notes}</p>` : ""}
      </div>`;
  }

  function signInCtaHtml(total) {
    return `<div class="card" style="padding:20px; margin-bottom:16px; border-style:dashed; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
      <p class="text-secondary" style="font-size:13.5px; margin:0;">${total} matching case${total === 1 ? "" : "s"} found. Sign in free to see the settlement/verdict amount, source, and outcome for each.</p>
      <a href="account.html" class="btn btn-primary btn-sm" style="white-space:nowrap;">Sign in free →</a>
    </div>`;
  }

  let requestSeq = 0;
  async function runSearch() {
    const seq = ++requestSeq;
    resultsHost.innerHTML = `<div class="gate-card is-loading">Loading…</div>`;
    countHost.textContent = "";

    const body = {
      category: categorySelect.value !== "all" ? categorySelect.value : undefined,
      jurisdiction: jurisdictionSelect.value !== "all" ? jurisdictionSelect.value : undefined,
      keyword: keywordInput.value.trim() || undefined,
      sort: sortSelect.value,
    };

    const headers = { "Content-Type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY };
    try {
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session && session.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // No session -- proceed anonymous, this endpoint has no error state for that.
    }

    let json;
    try {
      const resp = await fetch(BENCHMARKS_FN_URL, { method: "POST", headers, body: JSON.stringify(body) });
      json = await resp.json();
      if (!resp.ok) throw new Error(json && json.error ? json.error : `HTTP ${resp.status}`);
    } catch (err) {
      if (seq !== requestSeq) return;
      resultsHost.innerHTML = `<div class="gate-card is-error">Couldn't load benchmark data right now — try again shortly.</div>`;
      return;
    }
    if (seq !== requestSeq) return; // a newer filter change superseded this response

    const results = json.results || [];
    countHost.textContent = results.length ? `${json.total} matching case${json.total === 1 ? "" : "s"}` : "";

    if (!results.length) {
      resultsHost.innerHTML = window.RELAW_UTILS
        ? window.RELAW_UTILS.emptyStateHtml({ message: "No cases match these filters yet — try broadening your search." })
        : `<p class="text-muted">No cases match these filters yet.</p>`;
      return;
    }

    const ctaHtml = (!json.signedIn) ? signInCtaHtml(json.total) : "";
    resultsHost.innerHTML = ctaHtml + `<div class="sb-rows">${results.map((r) => r.locked ? lockedRowHtml(r) : fullRowHtml(r)).join("")}</div>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  const debouncedSearch = debounce(runSearch, 350);

  keywordInput.addEventListener("input", debouncedSearch);
  categorySelect.addEventListener("change", runSearch);
  jurisdictionSelect.addEventListener("change", runSearch);
  sortSelect.addEventListener("change", runSearch);
  clearBtn.addEventListener("click", () => {
    keywordInput.value = "";
    categorySelect.value = "all";
    jurisdictionSelect.value = "all";
    sortSelect.value = "amount-desc";
    runSearch();
  });

  // A category can arrive via ?category=lease-disputes (linked from a
  // Case Value Calculator result -- see case-valuation.js) so a user
  // lands here pre-filtered to the category they just got an estimate
  // for, instead of an unfiltered wall of every case in the database.
  function applyQueryParams() {
    const params = new URLSearchParams(location.search);
    const cat = params.get("category");
    if (cat) categorySelect.value = cat;
  }

  populateFilters();
  applyQueryParams();
  runSearch();
})();
