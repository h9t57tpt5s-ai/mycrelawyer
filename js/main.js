/* =========================================================
   CREdocket — Shared site behavior
   Nav state, mobile menu, scroll reveals, count-up stats
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Nav scroll state ---------- */
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Mobile nav toggle ---------- */
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const navScrim = document.querySelector(".nav-scrim");
  if (navToggle && navLinks) {
    const closeMenu = () => {
      navToggle.classList.remove("open");
      navLinks.classList.remove("open");
      if (navScrim) navScrim.classList.remove("open");
      document.body.style.overflow = "";
    };
    const openMenu = () => {
      navToggle.classList.add("open");
      navLinks.classList.add("open");
      if (navScrim) navScrim.classList.add("open");
      document.body.style.overflow = "hidden";
    };
    navToggle.addEventListener("click", () => {
      navToggle.classList.contains("open") ? closeMenu() : openMenu();
    });
    if (navScrim) navScrim.addEventListener("click", closeMenu);
    // Excludes the dropdown parent labels ("Tracker", "Guides &
    // Calculators", etc.) -- those no longer navigate (see the dropdown
    // section below), they toggle their submenu, and this listener used to
    // fire first and close the whole mobile panel out from under that
    // toggle before the user ever saw the submenu open.
    navLinks.querySelectorAll("a").forEach((a) => {
      if (a.parentElement.classList.contains("has-dropdown")) return;
      a.addEventListener("click", closeMenu);
    });
  }

  /* ---------- Nav dropdown ---------- */
  function closeAllDropdowns(except) {
    document.querySelectorAll(".nav-item.has-dropdown.open").forEach((item) => {
      if (item === except) return;
      item.classList.remove("open");
      const btn = item.querySelector(".nav-caret-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }
  function toggleDropdown(item, btn) {
    const isOpen = item.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    closeAllDropdowns(item);
  }
  document.querySelectorAll(".nav-item.has-dropdown").forEach((item) => {
    const btn = item.querySelector(".nav-caret-btn");
    if (!btn) return;
    // Every page bakes .active onto the ONE matching child link inside the
    // dropdown (e.g. "Judges & Courts" on judges.html) -- but the parent
    // label itself ("Research") never got any visual cue that the current
    // page lives in its section, so nothing in the top bar showed you were
    // even inside that part of the site. Reuses the existing a.active CSS
    // (color + underline) already defined for exact-match links -- no new
    // styles needed, just extending which element qualifies.
    const label = item.querySelector(":scope > a");
    if (label && item.querySelector(".nav-dropdown a.active")) label.classList.add("active");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown(item, btn);
    });
    // The parent label itself (e.g. "Tracker", "Guides & Calculators") is a
    // real <a href> pointing at whichever child page happened to be listed
    // first -- an implementation accident, not a deliberate landing page,
    // and clicking it used to silently navigate there instead of doing what
    // every visual cue around it implies (revealing the submenu, same as
    // the caret). A plain left-click now toggles the submenu instead;
    // modified clicks (cmd/ctrl/middle-click -- "open in a new tab") are
    // left alone so that real, if incidental, affordance still works.
    if (label) {
      label.addEventListener("click", (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        toggleDropdown(item, btn);
      });
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-item.has-dropdown")) closeAllDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal, .reveal-stagger");
  if (revealEls.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---------- Count-up stats ---------- */
  function animateCount(el) {
    const target = parseFloat(el.getAttribute("data-count"));
    const suffix = el.getAttribute("data-suffix") || "";
    const duration = 1400;
    const start = performance.now();
    const isInt = Number.isInteger(target);

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      el.textContent = (isInt ? Math.round(val) : val.toFixed(1)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const countEls = document.querySelectorAll("[data-count]");
  if (countEls.length && "IntersectionObserver" in window) {
    const countIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    countEls.forEach((el) => countIo.observe(el));
  }

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Hero headline rotation (homepage only) ----------
     User liked more than one draft tagline and asked for a rotating
     set "to keep the site fresh" -- picks one at random per page load.
     The hardcoded HTML text stays as the no-JS/SEO fallback. */
  const heroHeadline = document.getElementById("hero-headline");
  if (heroHeadline) {
    const HERO_TAGLINES = [
      "Where commercial real estate meets the courtroom.",
      "Litigation risk, tracked in real time.",
      "Every CRE lawsuit that matters, in one place.",
      "Commercial real estate litigation, mapped and tracked.",
      "The legal risk behind every deal, tracked live.",
      "Built for anyone who can't afford to miss a lawsuit that touches their deal.",
      "The litigation tracker for owners, developers, managers, and REITs.",
    ];
    heroHeadline.textContent = HERO_TAGLINES[Math.floor(Math.random() * HERO_TAGLINES.length)];
  }

  /* ---------- Hero live tracking map + feed (homepage only) ----------
     v1 was a decorative schematic-skyline SVG. v2: 3 real matters
     fanned like a stack of papers -- read as a rendering bug, not a
     deliberate look ("looks like a programming error"), per direct
     feedback. v3 was an all-dark "mission control" feed panel -- liked
     the precision/register, not the black ("still prefer a lighter
     color palette... still need slick graphics"). v4: the real
     jurisdiction map (same one on litigation.html) as the actual
     graphic, light palette, plus 3 of the most recent real matters
     below it, flat and grid-aligned, next to the headline as before
     (user: "I like having the stack next to the tagline"). */
  const heroMapHost = document.getElementById("hero-usmap-host");
  const heroMapSub = document.getElementById("hero-map-sub");
  const feedList = document.getElementById("hero-feed-list");
  const statStates = document.getElementById("hero-stat-states");
  const statCategories = document.getElementById("hero-stat-categories");
  if (feedList && typeof RELAW_DATA !== "undefined") {
    const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c]));
    const statusMap = Object.fromEntries(RELAW_DATA.statuses.map((s) => [s.id, s]));

    // The digest's chosen "flagship" story for its most recent run (the one
    // it wrote a full article for -- see scripts/re-legal-news-digest-
    // prompt.md) is marked `featured: true` on exactly one case per run.
    // Its own `date` (the underlying legal event) is often weeks/months old
    // even on the day it's added, so a plain "3 most recent by event date"
    // sort can and does leave it out entirely -- pin the most recently-
    // added featured case into the first slot instead of leaving that to
    // chance, then fill the rest with the usual recency sort.
    const featuredCase = [...RELAW_DATA.cases]
      .filter((c) => c.featured)
      .sort((a, b) => new Date(b.addedDate || b.date) - new Date(a.addedDate || a.date))[0];

    const byRecentEvent = [...RELAW_DATA.cases]
      .filter((c) => !featuredCase || c.id !== featuredCase.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const recent = featuredCase
      ? [featuredCase, ...byRecentEvent].slice(0, 3)
      : byRecentEvent.slice(0, 3);

    // Same computation state-guides.html uses for its own "N states with
    // tracked matters" count -- states with at least one real matter,
    // not all 51 (several tools cover all 51; the tracker itself only
    // has real matters in a subset).
    const statesWithMatters = new Set(RELAW_DATA.cases.map((c) => c.state).filter(Boolean));
    if (statCategories) statCategories.textContent = RELAW_DATA.categories.length;
    if (statStates) statStates.textContent = statesWithMatters.size;
    if (heroMapSub) heroMapSub.textContent = `${statesWithMatters.size} states with tracked matters`;

    if (heroMapHost && window.RELAW_UTILS.renderUsMap) {
      window.RELAW_UTILS.renderUsMap("hero-usmap-host", (code) => {
        window.location.href = `litigation.html?state=${code}`;
      });
    }

    feedList.innerHTML = recent.map((c) => {
      const cat = catMap[c.category];
      const status = statusMap[c.status];
      return `
        <div class="hero-feed-row" data-case-id="${c.id}">
          <span class="hero-feed-row-no"><span class="dot" style="background:${status.color}"></span></span>
          <span class="hero-feed-row-title">${c.featured ? `<span class="badge badge-live" style="margin-right:8px;">Today's Top Story</span>` : ""}${c.title}<span>${cat.label} · ${status.label}</span></span>
          <span class="hero-feed-row-date">${formatDate(c.date)}</span>
        </div>`;
    }).join("");
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /* ---------- Shared render helpers ---------- */
  function categoryById(id) {
    return RELAW_DATA.categories.find((c) => c.id === id);
  }
  function statusById(id) {
    return RELAW_DATA.statuses.find((s) => s.id === id);
  }

  function caseCardHtml(c) {
    const cat = categoryById(c.category);
    const status = statusById(c.status);
    const isLive = c.source === "live";
    // Always the underlying legal event's own date -- never addedDate.
    // A "when we added it" date used to double as a rough proxy for "how
    // current is this" (dateField: "added", previously used by the
    // Litigation Tracker and homepage featured cards), which worked while
    // the gap between an event and when we tracked it was days or weeks.
    // Backfilling older state-court matters to close Coverage Map gaps
    // broke that assumption -- a 2024 filing added to the tracker today
    // is not "recent" by any reasonable reading, so recency now only ever
    // means the event's own date, everywhere a date is shown as such.
    const dateTitleAttr = c.addedDate && c.addedDate !== c.date
      ? ` title="Added to tracker: ${formatDate(c.addedDate)}"`
      : "";
    return `
      <article class="card case-card reveal" data-case-id="${c.id}">
        <div class="case-card-top">
          <span class="badge" style="background:color-mix(in srgb, ${cat.color} 16%, transparent); color:${cat.color}; border:1px solid color-mix(in srgb, ${cat.color} 35%, transparent);">
            <span class="badge-dot" style="background:${cat.color}"></span>${cat.label}
          </span>
          ${isLive ? `<span class="badge badge-live">Verified Update</span>` : ""}
          <span class="status-pill" style="color:${status.color}">
            <span class="dot" style="background:${status.color}"></span>${status.label}
          </span>
        </div>
        <h3>${c.title}</h3>
        <p class="summary">${c.summary}</p>
        ${c.amount ? `<div class="detail-tag" style="display:inline-block; margin-bottom:14px;">${c.amount}</div>` : ""}
        <div class="case-card-meta">
          <span${dateTitleAttr}>${formatDate(c.date)}</span>
          <span>${c.jurisdiction}</span>
        </div>
      </article>`;
  }

  // A single matter, referenced from somewhere that ISN'T the tracker grid
  // (a judge's or company's "matters" list, a court's docket) -- these used
  // to degrade to a bare, colorless <span>Title ↗</span> with no category,
  // no status, no date, so a user drilling from "which judge handles the
  // most matters" into that judge's own case list lost every visual signal
  // the tracker invests in everywhere else. One compact row instead: the
  // same category/status colors as caseCardHtml above, just single-line.
  // opts.suffix appends extra text after the title (e.g. courts.html's
  // " · Judge Name"); opts.className lets a call site add its own spacing.
  function caseChipHtml(c, opts) {
    opts = opts || {};
    const cat = categoryById(c.category);
    const status = statusById(c.status);
    return `<span class="case-chip${opts.className ? " " + opts.className : ""}" data-case-id="${c.id}">
        <span class="case-chip-dot" style="background:${cat ? cat.color : "var(--text-muted)"}" title="${cat ? cat.label : ""}"></span>
        <span class="case-chip-dot" style="background:${status ? status.color : "var(--text-muted)"}" title="${status ? status.label : ""}"></span>
        <span class="case-chip-title">${c.title}${opts.suffix || ""}</span>
        <span class="case-chip-date">${formatDate(c.date)}</span>
      </span>`;
  }

  /* Settlement-rate aggregate for a judge's matters, shared by every
     judge-<slug>.html profile page (via the DOMContentLoaded block near
     the bottom of this file) and by judges.html's directory card. Single
     source of truth for both the "resolved" definition (settled or ruling
     -- filed/pending/appeal haven't reached an outcome yet) and the
     minimum-sample-size bar, so the two call sites can't drift apart.
     Mirrors the minimum of 3 already used for the settlement-benchmarks
     aggregate on contribute-settlement.html -- same honesty discipline:
     don't show a rate computed from 1-2 data points. */
  function judgeSettlementStats(matters, minSample) {
    minSample = minSample || 3;
    const RESOLVED_STATUSES = ["settled", "ruling"];
    const resolved = (matters || []).filter((c) => RESOLVED_STATUSES.indexOf(c.status) !== -1);
    const settledCount = resolved.filter((c) => c.status === "settled").length;
    return {
      resolvedCount: resolved.length,
      settledCount: settledCount,
      minSample: minSample,
      sufficientSample: resolved.length >= minSample,
      rate: resolved.length ? Math.round((settledCount / resolved.length) * 100) : null,
    };
  }

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.formatDate = formatDate;
  window.RELAW_UTILS.categoryById = typeof RELAW_DATA !== "undefined" ? categoryById : null;
  window.RELAW_UTILS.statusById = typeof RELAW_DATA !== "undefined" ? statusById : null;
  window.RELAW_UTILS.caseCardHtml = typeof RELAW_DATA !== "undefined" ? caseCardHtml : null;
  window.RELAW_UTILS.caseChipHtml = typeof RELAW_DATA !== "undefined" ? caseChipHtml : null;
  window.RELAW_UTILS.judgeSettlementStats = judgeSettlementStats;

  /* Renders the byline row shown under every case's headline in the detail
     panel. Single source of truth is RELAW_DATA.author (js/data.js) — this
     applies uniformly to every case, past and future, including ones added
     by the automated digest, without touching individual case records. */
  function bylineHtml() {
    if (typeof RELAW_DATA === "undefined" || !RELAW_DATA.author) return "";
    const a = RELAW_DATA.author;
    return `<div class="byline-row">
      <div class="byline-avatar">${a.initials}</div>
      <div class="byline-text">By <a href="${a.bioUrl}">${a.name}</a>, ${a.title}</div>
    </div>`;
  }
  window.RELAW_UTILS.bylineHtml = typeof RELAW_DATA !== "undefined" ? bylineHtml : null;

  /* Shared toast helper -- replaces the native alert() popups that were
     still handling PDF/report-generation errors in case-valuation-report.js,
     eviction-guide-report.js, and premises-liability-report.js. A blocking
     OS-chrome dialog looked out of place next to this site's fully custom
     gate-card/status-line error components everywhere else. One shared,
     dismissible, auto-expiring toast instead, used from any page that
     loads this file. */
  function showToast(message, opts) {
    opts = opts || {};
    let host = document.getElementById("relaw-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "relaw-toast-host";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = "toast" + (opts.error ? " is-error" : "");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("in-view"));
    const dismiss = () => {
      toast.classList.remove("in-view");
      setTimeout(() => toast.remove(), 250);
    };
    toast.addEventListener("click", dismiss);
    setTimeout(dismiss, opts.duration || 5000);
  }
  window.RELAW_UTILS.showToast = showToast;

  /* ---------- Export: filtered case list to CSV / PDF ----------
     Shared by litigation.html's filter bar (the primary use case: export
     whatever the current category/status/state/search filters are
     currently showing) and reusable anywhere else a page has an array of
     real case objects on hand. No backend involved -- everything here
     runs client-side against RELAW_DATA.cases (or a filtered subset of
     it) already in memory. */
  function csvCell(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function casesToCsv(cases) {
    const headers = ["Title", "Category", "Status", "Date", "Jurisdiction", "State", "Amount", "Summary", "Source URL"];
    const rows = cases.map((c) => {
      const cat = categoryById(c.category);
      const status = statusById(c.status);
      const stateName = (c.state && RELAW_DATA.states && RELAW_DATA.states[c.state]) || c.state || "";
      return [
        c.title, cat ? cat.label : c.category, status ? status.label : c.status,
        formatDate(c.date), c.jurisdiction, stateName, c.amount || "", c.summary, c.sourceUrl || "",
      ].map(csvCell).join(",");
    });
    // Leading BOM so Excel (which guesses encoding from the byte order
    // mark, not a declared charset the way a browser would) opens this as
    // UTF-8 instead of mis-rendering an em dash or a party name's accented
    // character -- both of which show up in real matter titles/summaries.
    return "﻿" + [headers.map(csvCell).join(","), ...rows].join("\r\n");
  }
  function downloadTextFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Hand-rolled instead of a table plugin -- jsPDF 2.5.1 (already loaded
  // on case-valuation.html/eviction-guide.html/premises-liability-guide.html
  // for their own report downloads) has no bundled table renderer, and one
  // more compact row per matter (bold title + a muted meta line) reads
  // better for a docket export than a cramped grid would anyway.
  function exportCasesToPdf(cases, opts) {
    opts = opts || {};
    if (typeof window.jspdf === "undefined") {
      showToast("PDF export isn't available on this page yet — try again in a moment, or use Export CSV instead.", { error: true });
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 48;
    let y = 56;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - marginX * 2;
    function addPageIfNeeded(need) {
      if (y + need > pageHeight - 48) {
        doc.addPage();
        y = 56;
      }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(20, 24, 33);
    doc.text(opts.title || "CREdocket — Litigation Tracker Export", marginX, y); y += 20;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 106, 120);
    const subtitle = (opts.subtitle ? opts.subtitle + " — " : "") +
      `${cases.length} matter${cases.length === 1 ? "" : "s"} — generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    doc.text(subtitle, marginX, y); y += 10;
    doc.setDrawColor(210, 213, 219);
    doc.line(marginX, y, pageWidth - marginX, y); y += 22;

    cases.forEach((c) => {
      const cat = categoryById(c.category);
      const status = statusById(c.status);
      addPageIfNeeded(50);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 24, 33);
      const titleLines = doc.splitTextToSize(c.title, contentWidth);
      doc.text(titleLines, marginX, y); y += titleLines.length * 13 + 3;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 106, 120);
      const stateName = (c.state && RELAW_DATA.states && RELAW_DATA.states[c.state]) || c.state || "";
      const metaLine = [
        cat ? cat.label : null,
        status ? status.label : null,
        formatDate(c.date),
        c.jurisdiction,
        c.amount || null,
      ].filter(Boolean).join("  |  ");
      const metaLines = doc.splitTextToSize(metaLine, contentWidth);
      addPageIfNeeded(metaLines.length * 11 + 14);
      doc.text(metaLines, marginX, y); y += metaLines.length * 11 + 10;
      doc.setDrawColor(232, 234, 238);
      doc.line(marginX, y, pageWidth - marginX, y); y += 14;
    });

    doc.save(opts.filename || `CREdocket_Export_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  window.RELAW_UTILS.casesToCsv = typeof RELAW_DATA !== "undefined" ? casesToCsv : null;
  window.RELAW_UTILS.downloadTextFile = downloadTextFile;
  window.RELAW_UTILS.exportCasesToPdf = typeof RELAW_DATA !== "undefined" ? exportCasesToPdf : null;

  // ---- Post-free-tool watchlist CTA ----
  // Added 2026-09-13 (10-agent premium-readiness review, UX finding): the
  // free rule-based tools (Mechanic's Lien Calculator, ADA Risk Flagging,
  // Premises Liability Checklist) each deliver a real, useful answer and
  // then dead-end -- nothing on the page connects that moment (a visitor
  // has just proven real intent, for a specific state/category) to the
  // one thing on the site that would keep them coming back: a free
  // watchlist. This is that connective tissue, reused across all three.
  // account.html's own ?state=/?category= query-param prefill is wired
  // in js/watchlists.js.
  function stateCodeByName(name) {
    if (typeof RELAW_DATA === "undefined" || !RELAW_DATA.states || !name) return null;
    const entry = Object.entries(RELAW_DATA.states).find(([, n]) => n === name);
    return entry ? entry[0] : null;
  }
  function watchlistCtaHtml(opts) {
    opts = opts || {};
    const params = new URLSearchParams();
    if (opts.stateCode) params.set("state", opts.stateCode);
    if (opts.categoryId) params.set("category", opts.categoryId);
    const qs = params.toString();
    return `<div class="card" style="padding:20px; margin-top:16px; border-style:dashed;">
      <div class="eyebrow" style="margin-bottom:8px;">Stay Ahead Of This</div>
      <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:14px;">${opts.message || "Get a free email alert the moment a new matter like this is added to the tracker — no card required."}</p>
      <a href="account.html${qs ? "?" + qs : ""}" class="btn btn-primary btn-sm">Create a free watchlist</a>
    </div>`;
  }
  window.RELAW_UTILS.stateCodeByName = stateCodeByName;
  window.RELAW_UTILS.watchlistCtaHtml = watchlistCtaHtml;

  /* Shared empty-state component -- litigation.js already had a real one
     (icon + message, centered) but three other "nothing here yet" states
     (watchlists, timeline, contribute-a-settlement) were bare <p> tags
     with no box and no icon, and none of the four ever offered an actual
     action -- just prose telling the user to look "above" for the thing
     that would fix it. One shared builder, reused everywhere, with a real
     optional button instead of a pointer. */
  function emptyStateHtml(opts) {
    opts = opts || {};
    const icon = opts.icon || '<svg viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const actionHtml = (opts.actionLabel && opts.actionId)
      ? `<button type="button" class="btn btn-ghost btn-sm" id="${opts.actionId}" style="margin-top:16px;">${opts.actionLabel}</button>`
      : "";
    return `<div class="empty-state"${opts.gridSpan ? ` style="grid-column: 1 / -1;"` : ""}>
      ${icon}
      <p>${opts.message}</p>
      ${actionHtml}
    </div>`;
  }
  window.RELAW_UTILS.emptyStateHtml = emptyStateHtml;

  /* Injects/updates a single JSON-LD block describing the currently open
     case's authorship, mirroring the visible byline above so the two never
     drift out of sync. Removed on close since it only describes whichever
     case is currently open. */
  function setCaseAuthorshipSchema(c) {
    if (typeof RELAW_DATA === "undefined" || !RELAW_DATA.author) return;
    const a = RELAW_DATA.author;
    let tag = document.getElementById("case-authorship-schema");
    if (!tag) {
      tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.id = "case-authorship-schema";
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LegalUpdate",
      headline: c.title,
      datePublished: c.addedDate || c.date,
      about: c.tags || [],
      author: {
        "@type": "Person",
        name: a.name,
        jobTitle: a.title,
        url: a.bioUrl ? `https://credocket.com/${a.bioUrl}` : undefined,
        sameAs: [a.linkedin]
      },
      publisher: { "@type": "Organization", name: "CREdocket" }
    });
  }
  function clearCaseAuthorshipSchema() {
    const tag = document.getElementById("case-authorship-schema");
    if (tag) tag.remove();
  }

  /* ---------- Detail panel (shared across pages) ---------- */
  function buildDetailPanel() {
    if (document.getElementById("detail-panel")) return;
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "detail-overlay";
    const panel = document.createElement("div");
    panel.className = "detail-panel";
    panel.id = "detail-panel";
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    function close() {
      overlay.classList.remove("open");
      panel.classList.remove("open");
      document.body.style.overflow = "";
      clearCaseAuthorshipSchema();
    }
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    window.RELAW_UTILS.openCaseDetail = function (caseId) {
      const c = RELAW_DATA.cases.find((x) => x.id === caseId);
      if (!c) return;
      if (window.RELAW_UTILS.recordCaseClick) window.RELAW_UTILS.recordCaseClick(caseId);
      setCaseAuthorshipSchema(c);
      const cat = categoryById(c.category);
      const status = statusById(c.status);
      const isLive = c.source === "live";
      const stateName = (c.state && RELAW_DATA.states[c.state]) || c.state || "—";

      const primarySourceHtml = c.documentUrl
        ? `<div class="primary-source-link">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M14 3v5h5M6 3h8l5 5v13H6V3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            <a href="${c.documentUrl}" target="_blank" rel="noopener">${c.documentLabel || "Read the primary document"} ↗</a>
          </div>`
        : "";

      // Distinct from primarySourceHtml above: a link to the case's actual
      // docket/tracking record (CourtListener, NYSCEF, re:SearchTX, a county
      // clerk system), not the document text itself. Only ever populated when
      // a specific, verified, case-matching docket was found -- see the
      // verification rules in scripts/re-legal-news-digest-prompt.md. Most
      // cases won't have one; that's expected, not a gap to fill.
      const docketLinkHtml = c.docketUrl
        ? `<div class="primary-source-link">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M4 4h16v16H4V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <a href="${c.docketUrl}" target="_blank" rel="noopener">${c.docketLabel || "View docket"} ↗</a>
          </div>`
        : "";

      const hasGatedContent = !!((c.body && c.body.length) || (c.timeline && c.timeline.length));

      function fullArticleInnerHtml() {
        let articleHtml;
        if (c.body && c.body.length) {
          articleHtml = c.body.map((p) => `<p class="body-text">${p}</p>`).join("");
          if (isLive && c.sourceUrl) {
            articleHtml += `<p class="body-text"><a href="${c.sourceUrl}" target="_blank" rel="noopener">Original source ↗</a></p>`;
          }
          articleHtml = primarySourceHtml + docketLinkHtml + articleHtml;
        } else if (isLive) {
          articleHtml = `
            <div class="article-pending">
              <p class="body-text" style="margin-bottom:14px;">The full digest write-up for this update hasn't synced from the research feed yet — only the summary above is available right now.</p>
              ${c.sourceUrl ? `<a href="${c.sourceUrl}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Read the original reporting ↗</a>` : ""}
            </div>`;
        } else {
          articleHtml = `<p class="body-text">Full write-up not available for this entry.</p>`;
        }
        return `
          ${c.timeline && c.timeline.length ? `
          <h3 style="margin-bottom:14px;">Case Timeline</h3>
          <div class="case-timeline">
            ${c.timeline.map((ev) => `
              <div class="timeline-event${ev.current ? " is-current" : ""}${ev.upcoming ? " is-upcoming" : ""}">
                <div class="timeline-event-dot"></div>
                <div class="timeline-event-body">
                  <div class="timeline-event-when">${ev.when}${ev.upcoming ? '<span class="timeline-upcoming-tag">Scheduled</span>' : ""}</div>
                  <div class="timeline-event-label">${ev.label}</div>
                </div>
              </div>`).join("")}
          </div>
          <div class="rule mt-24" style="margin-bottom:24px;"></div>` : ""}
          <h3 style="margin-bottom:14px;">Full Article</h3>
          ${articleHtml}`;
      }

      function gateStateHtml(state) {
        if (state.status === "not-logged-in") {
          return `<div class="gate-card">
            <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
            <h3 style="margin-bottom:8px;">Sign in to read the full write-up</h3>
            <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Case Timeline and the full article are free with an account — no card required.${window.RELAW_AUTH.ENFORCE_MONTHLY_LIMIT ? ` First ${window.RELAW_AUTH.MONTHLY_LIMIT} matters each month are on us.` : ""}</p>
            <button type="button" class="btn btn-primary btn-sm" id="gate-signin-btn">Sign in to continue</button>
          </div>`;
        }
        if (state.status === "limit-reached") {
          return `<div class="gate-card">
            <div class="eyebrow" style="margin-bottom:8px;">Monthly limit reached</div>
            <h3 style="margin-bottom:8px;">You've read your ${state.limit} free full write-ups this month</h3>
            <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Your free reads reset on ${state.resetLabel}. Need access to this matter sooner? <a href="contact.html?matter=${encodeURIComponent(c.title)}">Reach out</a> and we'll help.</p>
          </div>`;
        }
        return `<div class="gate-card">
          <div class="eyebrow" style="margin-bottom:8px;">Something went wrong</div>
          <p class="text-secondary" style="font-size:13.5px;">${state.message || "Couldn't check access — try reopening this matter."}</p>
        </div>`;
      }

      panel.innerHTML = `
        <div class="top-row">
          ${isLive ? `<span class="badge badge-live">Verified Update</span>` : ""}
          <button class="detail-close" aria-label="Close" id="detail-close-btn">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
        <span class="badge" style="background:color-mix(in srgb, ${cat.color} 16%, transparent); color:${cat.color}; border:1px solid color-mix(in srgb, ${cat.color} 35%, transparent);">
          <span class="badge-dot" style="background:${cat.color}"></span>${cat.label}
        </span>
        <h2>${c.title}</h2>
        <!-- Visible byline intentionally not rendered yet — the invisible
             JSON-LD authorship schema below ships first; bylineHtml() stays
             defined in RELAW_UTILS, ready to wire in here later. -->
        <span class="status-pill" style="color:${status.color}"><span class="dot" style="background:${status.color}"></span>${status.label}</span>
        <div class="detail-meta-grid">
          <div><div class="label">Date</div><div class="value">${formatDate(c.date)}</div></div>
          <div><div class="label">State</div><div class="value">${stateName}</div></div>
          <div style="grid-column:1 / -1;"><div class="label">Jurisdiction</div><div class="value">${c.jurisdiction}</div></div>
          ${(c.parties && c.parties.length) ? `<div style="grid-column:1 / -1;"><div class="label">Parties</div><div class="value" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">${c.parties.map((p) => `<span class="detail-tag">${p.role ? p.role + ": " : ""}${p.name}</span>`).join("")}</div></div>` : ""}
          ${c.judge ? `<div style="grid-column:1 / -1;"><div class="label">Presiding Judge</div><div class="value">${c.judge}</div></div>` : ""}
          ${c.propertyType ? `<div><div class="label">Property Type</div><div class="value">${c.propertyType}</div></div>` : ""}
          <div><div class="label">Amount / Scale</div><div class="value">${c.amount}</div></div>
          <div><div class="label">Status</div><div class="value">${status.label}</div></div>
        </div>
        <div id="detail-summary-block">
          <p class="body-text">${c.summary}</p>
          <h3 style="margin-bottom:10px;">Why it matters</h3>
          <p class="body-text">${c.significance}</p>
        </div>
        <div class="rule mt-24" style="margin-bottom:24px;"></div>
        <div id="detail-gated-content"></div>
        <div class="tag-row">${c.tags.map((t) => `<span class="detail-tag">${t}</span>`).join("")}</div>
        <div class="detail-cta">
          <div class="detail-cta-text">
            <strong>Facing something similar?</strong>
            <span>Discuss this matter, or one like it in your portfolio, with counsel.</span>
          </div>
          <a href="contact.html?matter=${encodeURIComponent(c.title)}&jurisdiction=${encodeURIComponent(c.jurisdiction)}" class="btn btn-primary btn-sm">
            Discuss This Matter
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      `;
      document.getElementById("detail-close-btn").addEventListener("click", close);
      overlay.classList.add("open");
      panel.classList.add("open");
      document.body.style.overflow = "hidden";
      if (window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(document.getElementById("detail-summary-block"));

      const gatedSlot = document.getElementById("detail-gated-content");
      function renderGated(html) {
        gatedSlot.innerHTML = html;
        if (window.RELAW_UTILS.linkifyGlossaryTerms) window.RELAW_UTILS.linkifyGlossaryTerms(gatedSlot);
      }
      if (!hasGatedContent) {
        renderGated(fullArticleInnerHtml());
      } else if (!window.RELAW_AUTH) {
        // Auth system didn't load — fail open rather than block content.
        renderGated(fullArticleInnerHtml());
      } else {
        gatedSlot.innerHTML = `<div class="gate-card is-loading">Checking access…</div>`;
        window.RELAW_AUTH.checkGate(c.id).then((state) => {
          // Panel may have moved on to a different case by the time this resolves.
          if (!panel.classList.contains("open") || document.getElementById("detail-gated-content") !== gatedSlot) return;
          if (state.status === "ok") {
            renderGated(fullArticleInnerHtml());
          } else {
            gatedSlot.innerHTML = gateStateHtml(state);
            const signInBtn = document.getElementById("gate-signin-btn");
            if (signInBtn) signInBtn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal(c.id));
          }
        });
      }
    };
  }

  if (typeof RELAW_DATA !== "undefined") {
    buildDetailPanel();
    document.addEventListener("click", (e) => {
      const cardEl = e.target.closest("[data-case-id]");
      if (cardEl) window.RELAW_UTILS.openCaseDetail(cardEl.getAttribute("data-case-id"));
    });
  }

  /* ---------- Judge profile: settlement-rate stat card ----------
     Adds a "Settlement Rate" card to the #jp-stats grid that every
     judge-<slug>.html page's own inline script already builds (practice
     areas / case status / coverage window). Living here instead of being
     hand-added to all 37 existing judge-*.html files means one edit
     covers every current and future profile page automatically.

     Runs on DOMContentLoaded rather than immediately: this file loads and
     executes near the top of </body>, well before each judge page's own
     inline script (the last script tag on the page, which fills in
     #jp-stats via a wholesale statsGrid.innerHTML = ...). Appending here
     immediately would either find an empty grid or get clobbered by that
     later overwrite. DOMContentLoaded fires only after the document is
     fully parsed -- which, since scripts execute in source order as the
     parser reaches them, means every synchronous <script> before it
     (including that page's own trailing inline block) has already run.

     A judge's real average time from filing to resolution was considered
     for this same card (per the Phase 3 roadmap ask) but isn't buildable
     from real data: RELAW_DATA.cases carries exactly one `date` field per
     matter ("date of the ruling/filing/development, not today" -- see
     scripts/re-legal-news-digest-prompt.md), a single point-in-time
     snapshot, not a filed/resolved date pair. Fabricating one isn't an
     option (see CLAUDE.md's "never fabricate content"), so this only
     ships the settlement-rate half. */
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof RELAW_DATA === "undefined" || !RELAW_DATA.cases || !RELAW_DATA.judges) return;
    const statsGrid = document.getElementById("jp-stats");
    if (!statsGrid) return; // not a judge profile page

    const slugMatch = location.pathname.match(/judge-([a-z0-9-]+)\.html$/i);
    if (!slugMatch) return;
    const judge = RELAW_DATA.judges.find((j) => j.slug === slugMatch[1]);
    if (!judge) return;

    const matters = RELAW_DATA.cases.filter((c) => c.judge === judge.name);
    const stats = window.RELAW_UTILS.judgeSettlementStats(matters);

    const cardHtml = stats.sufficientSample
      ? `<div class="card reveal in-view" style="padding:24px;">
          <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Settlement Rate</div>
          <div class="mono" style="font-size:2rem; font-weight:600; color:var(--accent);">${stats.rate}%</div>
          <div class="text-muted" style="font-size:12px; margin-top:6px;">${stats.settledCount} of ${stats.resolvedCount} resolved matters settled; the rest ended in a ruling</div>
        </div>`
      : `<div class="card reveal in-view" style="padding:24px;">
          <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Settlement Rate</div>
          <div class="text-secondary" style="font-size:13px; line-height:1.6;">Not enough resolved matters yet to compute a rate (${stats.resolvedCount} of ${stats.minSample} needed).</div>
        </div>`;

    statsGrid.insertAdjacentHTML("beforeend", cardHtml);
  });
})();
