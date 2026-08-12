/* =========================================================
   CREdocket — Trends in CRE page
   Renders RELAW_DATA.trends as cards, color-coded by the same
   category palette used on the litigation tracker.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const grid = document.getElementById("trends-grid");
  if (!grid) return;

  const items = [...(RELAW_DATA.trends || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const countEl = document.getElementById("trend-count");
  if (countEl) countEl.textContent = items.length;

  const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c]));
  const formatDate = window.RELAW_UTILS && window.RELAW_UTILS.formatDate
    ? window.RELAW_UTILS.formatDate
    : (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  function cardHtml(t) {
    const cat = catMap[t.category] || { label: "Market Trend", color: "var(--accent)" };
    const isLive = t.source === "live";
    return `<div class="card reveal">
      <div class="case-card-top" style="margin-bottom:14px;">
        <span class="badge" style="background:color-mix(in srgb, ${cat.color} 16%, transparent); color:${cat.color}; border:1px solid color-mix(in srgb, ${cat.color} 35%, transparent);">
          <span class="badge-dot" style="background:${cat.color}"></span>${cat.label}
        </span>
        ${isLive ? `<span class="badge badge-live">Verified Update</span>` : ""}
      </div>
      <h3 style="font-size:1.05rem; line-height:1.35;">${t.title}</h3>
      <p class="text-muted mono" style="font-size:12px; margin:10px 0;">${formatDate(t.date)} &middot; ${t.scope}</p>
      ${t.metric ? `<p class="mono" style="font-size:13px; color:${cat.color}; font-weight:600; margin-bottom:12px;">${t.metric}</p>` : ""}
      <p class="text-secondary" style="font-size:13.5px; line-height:1.65;">${t.summary}</p>
      ${t.significance ? `<div class="rule mt-16" style="margin-bottom:12px;"></div><p class="text-secondary" style="font-size:13px; line-height:1.65;"><strong>Why it matters:</strong> ${t.significance}</p>` : ""}
      ${t.tags && t.tags.length ? `<div class="tag-row mt-16">${t.tags.map((tag) => `<span class="detail-tag">${tag}</span>`).join("")}</div>` : ""}
      ${t.sourceUrl ? `<div class="mt-16"><a href="${t.sourceUrl}" target="_blank" rel="noopener" class="text-accent" style="font-size:12.5px;">Read the source ↗</a></div>` : ""}
    </div>`;
  }

  grid.innerHTML = items.length
    ? items.map(cardHtml).join("")
    : `<p class="text-muted">No trend reports tracked yet.</p>`;

  grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
})();
