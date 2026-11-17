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

  // Every word of the query must appear somewhere, in any order, ignoring
  // case, punctuation and "&" vs "and" (2026-11-16: whole-phrase matching
  // made "addison ice arena foreclosure" find nothing).
  function norm(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['\u2019]/g, "").replace(/[^a-z0-9$.]+/g, " ").trim();
  }
  function tokensOf(q) { return norm(q).split(" ").filter(Boolean); }
  function matchesAll(hay, toks) { for (const w of toks) { if (hay.indexOf(w) === -1) return false; } return true; }
  const hayCache = new Map();

  // Generated record pages (Chapter 11, federal and state cases, CMBS,
  // properties, markets, outcomes), built by scripts/build_search_index.ts
  // and fetched on first use.
  let recordIndex = null, recordLoading = false;
  function loadRecordIndex() {
    if (recordIndex || recordLoading) return;
    recordLoading = true;
    fetch("/js/search-index.json").then((r) => r.ok ? r.json() : { items: [] }).then((j) => {
      recordIndex = (j.items || []).map((x) => Object.assign({ hay: norm(x.t + " " + x.d), titleHay: norm(x.t) }, x));
      document.dispatchEvent(new Event("relaw:search-index"));
    }).catch(() => { recordIndex = []; });
  }
  function searchRecords(toks) {
    if (!recordIndex) return [];
    return recordIndex.filter((x) => matchesAll(x.hay, toks)).map((x) => ({
      type: "record", href: x.u, title: x.t, snippet: x.d, meta: x.k, color: "var(--text-muted)",
      score: matchesAll(x.titleHay, toks) ? 2 : 1,
    }));
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // The query word to highlight: the whole query if it appears as typed,
  // else the longest single word that does.
  function firstHit(text, q) {
    const low = text.toLowerCase();
    if (low.includes(q.toLowerCase())) return q;
    const words = q.split(/\s+/).filter((w) => w.length > 1 && low.includes(w.toLowerCase())).sort((a, b) => b.length - a.length);
    return words[0] || q;
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
    const bodyText = c.body ? c.body.join(" ") : (c.bodyText || "");
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
  function searchCases(q, toks) {
    const catMap = Object.fromEntries(RELAW_DATA.categories.map((cat) => [cat.id, cat]));
    const results = [];
    RELAW_DATA.cases.forEach((c) => {
      const f = fieldsOf(c);
      const key = c.id + "|" + (f.body ? f.body.length : 0);
      let hay = hayCache.get(key);
      if (!hay) { hay = norm(Object.values(f).join(" ") + " " + (c.parties || []).map((p) => p.name || p).join(" ")); hayCache.set(key, hay); }
      if (!matchesAll(hay, toks)) return;
      let snippetField = "summary";
      if (f.title.toLowerCase().includes(q)) snippetField = "title";
      else if (f.summary.toLowerCase().includes(q)) snippetField = "summary";
      else if (f.significance.toLowerCase().includes(q)) snippetField = "significance";
      else if (f.body.toLowerCase().includes(q)) snippetField = "body";
      else if (f.tags.toLowerCase().includes(q)) snippetField = "tags";
      else snippetField = "jurisdiction";
      const cat = catMap[c.category];
      results.push({
        type: "case", caseId: c.id, sortDate: c.date, score: matchesAll(norm(c.title), toks) ? 2 : 1,
        title: c.title, snippet: f[snippetField] || f.summary,
        meta: `${cat.label} · ${c.jurisdiction}`, color: cat.color,
      });
    });
    return results;
  }

  function searchJudges(q, toks) {
    const judges = (RELAW_DATA.judges || []).concat(RELAW_DATA.courts || []);
    const results = [];
    judges.forEach((j) => {
      if (!matchesAll(norm([j.name, j.title, j.court, j.background].filter(Boolean).join(" ")), toks)) return;
      const snippet = (j.background && j.background.toLowerCase().includes(q)) ? j.background : (j.court || j.title || "");
      results.push({
        type: "judge", href: j.slug ? `/judge-${j.slug}.html` : "/judges.html", score: matchesAll(norm(j.name), toks) ? 2 : 1,
        title: j.name, snippet, meta: j.title || j.court || "Judge", color: "var(--text-muted)",
      });
    });
    return results;
  }

  function searchCompanies(q, toks) {
    const results = [];
    (RELAW_DATA.trackedParties || []).forEach((p) => {
      if (!matchesAll(norm([p.name, p.matchTerm, p.description].filter(Boolean).join(" ")), toks)) return;
      let domain = "";
      try { domain = p.website ? new URL(p.website).hostname.replace(/^www\./, "") : ""; } catch (e) { /* malformed URL, skip */ }
      results.push({
        type: "company", href: p.slug ? `/company-${p.slug}.html` : "/companies.html", score: matchesAll(norm(p.name), toks) ? 3 : 1,
        title: p.name, snippet: p.description || "", meta: domain, color: "var(--text-muted)",
      });
    });
    return results;
  }

  function searchPages(q, toks) {
    const results = [];
    PAGES.forEach((p) => {
      if (!matchesAll(norm(p.title + " " + p.description), toks)) return;
      results.push({ type: "page", href: "/" + p.href, title: p.title, snippet: p.description, meta: "", color: "var(--accent-deep)", score: matchesAll(norm(p.title), toks) ? 2 : 1 });
    });
    return results;
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    const toks = tokensOf(q);
    if (!toks.length) return [];
    // A name match (company, then any title) ranks first; within a rank,
    // matters stay newest first and keep the lead over other kinds.
    const cases = searchCases(q, toks).sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
    const all = [...cases, ...searchCompanies(q, toks), ...searchJudges(q, toks), ...searchRecords(toks), ...searchPages(q, toks)];
    return all.map((r, i) => [r, i]).sort((a, b) => (b[0].score || 1) - (a[0].score || 1) || a[1] - b[1]).map((x) => x[0]);
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
          <input type="text" id="global-search-input" placeholder="Search cases, companies, properties, courts, tools…" autocomplete="off" />
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
      loadRecordIndex();
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

    const TYPE_LABEL = { case: null, judge: "Judge", company: "Company", page: "Tool / Guide", record: null };

    function renderResults(query) {
      const q = query.trim();
      if (!q) {
        resultsHost.innerHTML = `<div class="search-placeholder">Search matters, judges, companies, and every tool or guide -- not just titles.</div>`;
        return;
      }
      const matches = search(q);
      if (!matches.length) {
        resultsHost.innerHTML = recordIndex
          ? `<div class="search-empty">Nothing matches "${escapeHtml(q)}". Try fewer words, or a company, property, city or court name.</div>`
          : `<div class="search-empty">Searching…</div>`;
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
            ${r.snippet ? `<p>${highlight(r.snippet, firstHit(r.snippet, q))}</p>` : ""}
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
          window.location.href = "/litigation.html?q=" + encodeURIComponent(q);
        });
      }
    }

    let debounceTimer, searchLogTimer;
    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderResults(e.target.value), 120);
      if (window.RELAW_UTILS && window.RELAW_UTILS.loadMatterText) window.RELAW_UTILS.loadMatterText();
      const q = e.target.value.trim();
      clearTimeout(searchLogTimer);
      if (q.length >= 3 && window.RELAW_TRACK) {
        // This overlay (Cmd/Ctrl+K, every page) has never logged a search at
        // all -- logged once typing pauses, same floor/shape as the
        // litigation.html filter box's own tracked "search" event.
        searchLogTimer = setTimeout(() => window.RELAW_TRACK("search", { detail: `overlay: ${search(q).length} results` }), 1500);
      }
    });
    // Write-up text arrives after the first keystroke; re-run the search.
    document.addEventListener("relaw:matter-text", () => { if (input.value.trim()) renderResults(input.value); });
    document.addEventListener("relaw:search-index", () => { if (input.value.trim()) renderResults(input.value); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = input.value.trim();
        if (q) {
          // Enter opens the top result when it is a page of its own;
          // matters still go to the tracker's filtered list.
          const top = search(q)[0];
          close();
          window.location.href = top && top.type !== "case" ? top.href : "/litigation.html?q=" + encodeURIComponent(q);
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
