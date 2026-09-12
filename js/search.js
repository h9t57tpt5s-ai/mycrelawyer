/* =========================================================
   CREdocket — Global search
   -----------------------------------------------------------
   Site-wide search over every matter's full text (title,
   summary, why-it-matters, full article body, tags,
   jurisdiction), PLUS judges, companies/parties, and every
   guide/tool page (a static directory below, since those
   aren't in RELAW_DATA). Available from any page via Cmd/Ctrl+K
   or "/" -- injects a search trigger into the nav and opens an
   overlay with live, mixed-type results: a matter opens the
   shared detail panel directly, everything else (judge, company,
   page) navigates to its own page. Long result lists still hand
   off matter-only overflow to the Litigation Tracker's own
   filter search via ?q=.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const MAX_RESULTS = 8;

  // Hand-maintained -- these are static pages, not RELAW_DATA records, so
  // there's nothing to derive this list from automatically. Add a line
  // whenever a new tool/guide/report page ships.
  const PAGES = [
    { title: "Case Value Calculator", href: "case-valuation.html", description: "AI-assisted probability-weighted case value estimate from your own documents." },
    { title: "Lease Clause Redline Checker", href: "lease-clause-redline.html", description: "Flags unusual or missing lease terms against market norms." },
    { title: "Mechanic's Lien Deadline Calculator", href: "lien-deadline-calculator.html", description: "Preliminary notice, filing, and enforcement deadlines, all 51 jurisdictions." },
    { title: "ADA Title III Risk Flagging", href: "ada-risk-flagging.html", description: "Property-type-specific ADA serial-litigation exposure by state." },
    { title: "Premises Liability Checklist", href: "premises-liability-checklist.html", description: "Manager-facing checklist for premises liability and negligence exposure." },
    { title: "Commercial Eviction Handbook", href: "eviction-guide.html", description: "Statutory notice, self-help, jurisdiction, and damages, all 50 states plus D.C." },
    { title: "Premises Liability / Negligence Guide", href: "premises-liability-guide.html", description: "Elements, defenses, comparative fault, and punitive damages, all 51 jurisdictions." },
    { title: "Insurance & Risk Posture Guide", href: "insurance-risk-posture-guide.html", description: "Coverage and risk-transfer guidance for commercial property owners and managers." },
    { title: "Manager vs. Owner Liability", href: "manager-vs-owner-liability.html", description: "Who's exposed: property manager vs. owner liability allocation." },
    { title: "Algorithmic Pricing: A Manager's Guide", href: "algorithmic-pricing-manager-guide.html", description: "Litigation exposure from algorithmic/revenue-management rent pricing." },
    { title: "State-by-State Guides", href: "state-guides.html", description: "Every state-specific practice-area litigation guide, indexed by state." },
    { title: "Market Signals", href: "trends.html", description: "Aggregate trend reports across tracked litigation." },
    { title: "Quarterly Report", href: "quarterly.html", description: "Narrative synthesis of the quarter's tracked litigation." },
    { title: "Litigation Patterns by State", href: "ada-litigation-patterns.html", description: "State-by-state litigation pattern analysis." },
    { title: "Property Type Insights", href: "property-types.html", description: "Litigation trends by commercial property type." },
    { title: "Judges & Courts", href: "judges.html", description: "Directory of judges and courts presiding over tracked matters." },
    { title: "Companies & Parties", href: "companies.html", description: "Directory of companies and parties named across tracked matters." },
    { title: "Compare Companies", href: "compare-companies.html", description: "Side-by-side litigation exposure comparison across companies." },
    { title: "Contribute a Settlement", href: "contribute-settlement.html", description: "Submit a real settlement, earn free analysis credits." },
    { title: "Litigation Tracker", href: "litigation.html", description: "The full searchable, filterable litigation database." },
    { title: "Litigation Calendar", href: "calendar.html", description: "Upcoming hearings, filing deadlines, and procedural dates." },
    { title: "Regulatory Issues", href: "regulatory.html", description: "Regulatory and zoning actions affecting commercial real estate." },
    { title: "Watchlists", href: "account.html", description: "Get alerted when a matching matter is added to the tracker." },
  ];

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

  // Every result, regardless of source, normalizes to the same shape:
  // { type, title, snippet, meta, color, caseId? | href? }. type "case"
  // opens the shared detail panel via caseId; every other type navigates
  // to href. This is what lets one results list mix matters, judges,
  // companies, and pages without four different rendering paths.
  function searchCases(q) {
    const catMap = Object.fromEntries(RELAW_DATA.categories.map((cat) => [cat.id, cat]));
    const results = [];
    RELAW_DATA.cases.forEach((c) => {
      const f = fieldsOf(c);
      const haystack = Object.values(f).join(" ").toLowerCase();
      if (!haystack.includes(q)) return;
      let snippetField = "summary";
      if (f.title.toLowerCase().includes(q)) snippetField = "title";
      else if (f.summary.toLowerCase().includes(q)) snippetField = "summary";
      else if (f.significance.toLowerCase().includes(q)) snippetField = "significance";
      else if (f.body.toLowerCase().includes(q)) snippetField = "body";
      else if (f.tags.toLowerCase().includes(q)) snippetField = "tags";
      else snippetField = "jurisdiction";
      const cat = catMap[c.category];
      results.push({
        type: "case", caseId: c.id, sortDate: c.date,
        title: c.title, snippet: f[snippetField] || f.summary,
        meta: `${cat.label} · ${c.jurisdiction}`, color: cat.color,
      });
    });
    return results;
  }

  function searchJudges(q) {
    const judges = (RELAW_DATA.judges || []).concat(RELAW_DATA.courts || []);
    const results = [];
    judges.forEach((j) => {
      const haystack = [j.name, j.title, j.court, j.background].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return;
      const snippet = (j.background && j.background.toLowerCase().includes(q)) ? j.background : (j.court || j.title || "");
      results.push({
        type: "judge", href: j.slug ? `judge-${j.slug}.html` : "judges.html",
        title: j.name, snippet, meta: j.title || j.court || "Judge", color: "var(--text-muted)",
      });
    });
    return results;
  }

  function searchCompanies(q) {
    const results = [];
    (RELAW_DATA.trackedParties || []).forEach((p) => {
      const haystack = [p.name, p.matchTerm, p.description].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return;
      let domain = "";
      try { domain = p.website ? new URL(p.website).hostname.replace(/^www\./, "") : ""; } catch (e) { /* malformed URL, skip */ }
      results.push({
        type: "company", href: p.slug ? `company-${p.slug}.html` : "companies.html",
        title: p.name, snippet: p.description || "", meta: domain, color: "var(--text-muted)",
      });
    });
    return results;
  }

  function searchPages(q) {
    const results = [];
    PAGES.forEach((p) => {
      const haystack = [p.title, p.description].join(" ").toLowerCase();
      if (!haystack.includes(q)) return;
      results.push({ type: "page", href: p.href, title: p.title, snippet: p.description, meta: "", color: "var(--accent-deep)" });
    });
    return results;
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Cases first (newest first, the highest-volume content), then
    // judges/companies/pages -- each internally unsorted since there's
    // no meaningful ranking signal beyond "it matched."
    const cases = searchCases(q).sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
    return [...cases, ...searchJudges(q), ...searchCompanies(q), ...searchPages(q)];
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
          <input type="text" id="global-search-input" placeholder="Search matters, judges, companies, tools, guides…" autocomplete="off" />
          <span class="search-hint">Esc</span>
          <button class="search-close-btn" id="global-search-close" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="search-results" id="global-search-results">
          <div class="search-placeholder">Search matters, judges, companies, and every tool or guide -- not just titles.</div>
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

    const TYPE_LABEL = { case: null, judge: "Judge", company: "Company", page: "Tool / Guide" };

    function renderResults(query) {
      const q = query.trim();
      if (!q) {
        resultsHost.innerHTML = `<div class="search-placeholder">Search matters, judges, companies, and every tool or guide -- not just titles.</div>`;
        return;
      }
      const matches = search(q);
      if (!matches.length) {
        resultsHost.innerHTML = `<div class="search-empty">Nothing matches "${escapeHtml(q)}".</div>`;
        return;
      }
      const shown = matches.slice(0, MAX_RESULTS);
      const caseTotal = matches.filter((r) => r.type === "case").length;
      const caseShown = shown.filter((r) => r.type === "case").length;
      resultsHost.innerHTML =
        shown
          .map(
            (r, i) => `
        <div class="search-result-row" data-index="${i}">
          <span class="search-result-dot" style="background:${r.color}"></span>
          <div class="search-result-body">
            <h4>${escapeHtml(r.title)}</h4>
            ${r.snippet ? `<p>${highlight(r.snippet, q)}</p>` : ""}
            <div class="search-result-meta">${[TYPE_LABEL[r.type], r.meta].filter(Boolean).map(escapeHtml).join(" · ")}</div>
          </div>
        </div>`
          )
          .join("") +
        (caseTotal > caseShown
          ? `<div class="search-view-all" id="search-view-all">View all ${caseTotal} matching matters in the Litigation Tracker →</div>`
          : "");

      resultsHost.querySelectorAll(".search-result-row").forEach((row) => {
        row.addEventListener("click", () => {
          const r = shown[parseInt(row.getAttribute("data-index"), 10)];
          close();
          if (r.type === "case") {
            if (window.RELAW_UTILS && window.RELAW_UTILS.openCaseDetail) window.RELAW_UTILS.openCaseDetail(r.caseId);
          } else {
            window.location.href = r.href;
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
