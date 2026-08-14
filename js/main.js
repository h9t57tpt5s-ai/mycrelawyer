/* =========================================================
   CREdocket — Shared site behavior
   Nav state, mobile menu, scroll reveals, count-up stats, ticker
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
    navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenu));
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
  document.querySelectorAll(".nav-item.has-dropdown").forEach((item) => {
    const btn = item.querySelector(".nav-caret-btn");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      closeAllDropdowns(item);
    });
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

  /* ---------- Ticker (built from tracked matters) ---------- */
  const tickerTrack = document.getElementById("ticker-track");
  if (tickerTrack && typeof RELAW_DATA !== "undefined") {
    const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c]));
    const recent = [...RELAW_DATA.cases]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    const itemHtml = (c) => {
      const cat = catMap[c.category];
      return `<span class="ticker-item" data-case-id="${c.id}" title="Read ${c.title}"><span class="ticker-dot" style="background:${cat.color}"></span>${formatDate(c.date)} — ${c.title}</span>`;
    };

    const html = recent.map(itemHtml).join("") + recent.map(itemHtml).join("");
    tickerTrack.innerHTML = html;
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
        <div class="case-card-meta">
          <span>${formatDate(c.date)}</span>
          <span>${c.jurisdiction}</span>
        </div>
      </article>`;
  }

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.formatDate = formatDate;
  window.RELAW_UTILS.categoryById = typeof RELAW_DATA !== "undefined" ? categoryById : null;
  window.RELAW_UTILS.statusById = typeof RELAW_DATA !== "undefined" ? statusById : null;
  window.RELAW_UTILS.caseCardHtml = typeof RELAW_DATA !== "undefined" ? caseCardHtml : null;

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
    }
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });

    window.RELAW_UTILS.openCaseDetail = function (caseId) {
      const c = RELAW_DATA.cases.find((x) => x.id === caseId);
      if (!c) return;
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

      const hasGatedContent = !!((c.body && c.body.length) || (c.timeline && c.timeline.length));

      function fullArticleInnerHtml() {
        let articleHtml;
        if (c.body && c.body.length) {
          articleHtml = c.body.map((p) => `<p class="body-text">${p}</p>`).join("");
          if (isLive && c.sourceUrl) {
            articleHtml += `<p class="body-text"><a href="${c.sourceUrl}" target="_blank" rel="noopener">Original source ↗</a></p>`;
          }
          articleHtml = primarySourceHtml + articleHtml;
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
            <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Case Timeline and the full article are free with an account — no card required. First ${window.RELAW_AUTH.MONTHLY_LIMIT} matters each month are on us.</p>
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
        <span class="status-pill" style="color:${status.color}"><span class="dot" style="background:${status.color}"></span>${status.label}</span>
        <div class="detail-meta-grid">
          <div><div class="label">Date</div><div class="value">${formatDate(c.date)}</div></div>
          <div><div class="label">State</div><div class="value">${stateName}</div></div>
          <div style="grid-column:1 / -1;"><div class="label">Jurisdiction</div><div class="value">${c.jurisdiction}</div></div>
          ${c.judge ? `<div style="grid-column:1 / -1;"><div class="label">Presiding Judge</div><div class="value">${c.judge}</div></div>` : ""}
          <div><div class="label">Amount / Scale</div><div class="value">${c.amount}</div></div>
          <div><div class="label">Status</div><div class="value">${status.label}</div></div>
        </div>
        <p class="body-text">${c.summary}</p>
        <h3 style="margin-bottom:10px;">Why it matters</h3>
        <p class="body-text">${c.significance}</p>
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

      const gatedSlot = document.getElementById("detail-gated-content");
      if (!hasGatedContent) {
        gatedSlot.innerHTML = fullArticleInnerHtml();
      } else if (!window.RELAW_AUTH) {
        // Auth system didn't load — fail open rather than block content.
        gatedSlot.innerHTML = fullArticleInnerHtml();
      } else {
        gatedSlot.innerHTML = `<div class="gate-card is-loading">Checking access…</div>`;
        window.RELAW_AUTH.checkGate(c.id).then((state) => {
          // Panel may have moved on to a different case by the time this resolves.
          if (!panel.classList.contains("open") || document.getElementById("detail-gated-content") !== gatedSlot) return;
          if (state.status === "ok") {
            gatedSlot.innerHTML = fullArticleInnerHtml();
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
})();
