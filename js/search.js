/* =========================================================
   CREdocket — Global search
   -----------------------------------------------------------
   Site-wide search over every matter's full text (title,
   summary, why-it-matters, full article body, tags,
   jurisdiction). Available from any page: injects a search
   trigger into the nav and opens an overlay with live results
   that open the shared detail panel directly, or hand off to
   the Litigation Tracker's own filter search via ?q=.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const MAX_RESULTS = 8;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function highlight(text, q) {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(text.slice(0, 140)) + (text.length > 140 ? "…" : "");
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + q.length + 80);
    const before = escapeHtml(text.slice(start, idx));
    const match = escapeHtml(text.slice(idx, idx + q.length));
    const after = escapeHtml(text.slice(idx + q.length, end));
    return (start > 0 ? "…" : "") + before + "<mark>" + match + "</mark>" + after + (end < text.length ? "…" : "");
  }

  function fieldsOf(c) {
    const stateName = c.state ? RELAW_DATA.states[c.state] || "" : "";
    const bodyText = c.body ? c.body.join(" ") : "";
    return {
      title: c.title,
      summary: c.summary,
      significance: c.significance,
      body: bodyText,
      tags: c.tags.join(" "),
      jurisdiction: c.jurisdiction,
      stateName
    };
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const catMap = Object.fromEntries(RELAW_DATA.categories.map((cat) => [cat.id, cat]));
    const results = [];
    RELAW_DATA.cases.forEach((c) => {
      const f = fieldsOf(c);
      const haystack = Object.values(f).join(" ").toLowerCase();
      if (!haystack.includes(q)) return;

      // pick the best field to show a snippet from: prefer body/summary over title
      let snippetField = "summary";
      if (f.title.toLowerCase().includes(q)) snippetField = "title";
      else if (f.summary.toLowerCase().includes(q)) snippetField = "summary";
      else if (f.significance.toLowerCase().includes(q)) snippetField = "significance";
      else if (f.body.toLowerCase().includes(q)) snippetField = "body";
      else if (f.tags.toLowerCase().includes(q)) snippetField = "tags";
      else snippetField = "jurisdiction";

      results.push({ case: c, cat: catMap[c.category], snippet: f[snippetField] || f.summary });
    });
    // newest first
    results.sort((a, b) => new Date(b.case.date) - new Date(a.case.date));
    return results;
  }

  function init() {
    const navCta = document.querySelector(".nav-cta");
    if (!navCta) return;

    const toggle = document.createElement("button");
    toggle.className = "nav-search-toggle";
    toggle.setAttribute("aria-label", "Search");
    toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    navCta.insertBefore(toggle, navCta.firstChild);

    const overlay = document.createElement("div");
    overlay.className = "search-overlay";
    overlay.id = "search-overlay";
    overlay.innerHTML = `
      <div class="search-panel">
        <div class="search-input-row">
          <svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input type="text" id="global-search-input" placeholder="Search matters, jurisdictions, topics…" autocomplete="off" />
          <span class="search-hint">Esc</span>
          <button class="search-close-btn" id="global-search-close" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="search-results" id="global-search-results">
          <div class="search-placeholder">Search across every matter's full write-up, not just titles.</div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#global-search-input");
    const resultsHost = overlay.querySelector("#global-search-results");
    const closeBtn = overlay.querySelector("#global-search-close");

    function open() {
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";
      setTimeout(() => input.focus(), 50);
    }
    function close() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }

    toggle.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") ||
          ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        open();
      } else if (e.key === "Escape" && overlay.classList.contains("open")) {
        close();
      }
    });

    function renderResults(query) {
      const q = query.trim();
      if (!q) {
        resultsHost.innerHTML = `<div class="search-placeholder">Search across every matter's full write-up, not just titles.</div>`;
        return;
      }
      const matches = search(q);
      if (!matches.length) {
        resultsHost.innerHTML = `<div class="search-empty">No matters mention "${escapeHtml(q)}".</div>`;
        return;
      }
      const shown = matches.slice(0, MAX_RESULTS);
      resultsHost.innerHTML =
        shown
          .map(
            (r) => `
        <div class="search-result-row" data-case-id="${r.case.id}">
          <span class="search-result-dot" style="background:${r.cat.color}"></span>
          <div class="search-result-body">
            <h4>${escapeHtml(r.case.title)}</h4>
            <p>${highlight(r.snippet, q)}</p>
            <div class="search-result-meta">${r.cat.label} · ${r.case.jurisdiction}</div>
          </div>
        </div>`
          )
          .join("") +
        (matches.length > MAX_RESULTS
          ? `<div class="search-view-all" id="search-view-all">View all ${matches.length} matches in the Litigation Tracker →</div>`
          : "");

      resultsHost.querySelectorAll(".search-result-row").forEach((row) => {
        row.addEventListener("click", () => {
          const id = row.getAttribute("data-case-id");
          close();
          if (window.RELAW_UTILS && window.RELAW_UTILS.openCaseDetail) {
            window.RELAW_UTILS.openCaseDetail(id);
          }
        });
      });
      const viewAll = resultsHost.querySelector("#search-view-all");
      if (viewAll) {
        viewAll.addEventListener("click", () => {
          window.location.href = "litigation.html?q=" + encodeURIComponent(q);
        });
      }
    }

    let debounceTimer;
    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderResults(e.target.value), 120);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = input.value.trim();
        if (q) {
          close();
          window.location.href = "litigation.html?q=" + encodeURIComponent(q);
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
