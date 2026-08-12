/* =========================================================
   CREdocket — Updates page: chronological feed
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const feed = document.getElementById("updates-feed");
  if (!feed) return;

  const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c]));
  const statusMap = Object.fromEntries(RELAW_DATA.statuses.map((s) => [s.id, s]));
  const formatDate = window.RELAW_UTILS.formatDate;

  function rowHtml(c) {
    const cat = catMap[c.category];
    const status = statusMap[c.status];
    const isLive = c.source === "live";
    const stateName = c.state ? RELAW_DATA.states[c.state] : null;
    const d = new Date(c.date + "T00:00:00");
    return `
      <article class="update-row" data-case-id="${c.id}">
        <div class="update-date">
          ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br>${d.getFullYear()}
        </div>
        <span class="update-dot" style="background:${cat.color}"></span>
        <div class="update-content">
          <h3>${c.title}</h3>
          <p class="summary">${c.summary}</p>
          <div class="update-meta-row">
            <span class="badge" style="background:color-mix(in srgb, ${cat.color} 16%, transparent); color:${cat.color}; border:1px solid color-mix(in srgb, ${cat.color} 35%, transparent);">
              <span class="badge-dot" style="background:${cat.color}"></span>${cat.label}
            </span>
            <span class="status-pill" style="color:${status.color}"><span class="dot" style="background:${status.color}"></span>${status.label}</span>
            ${isLive ? `<span class="badge badge-live">Verified Update</span>` : ""}
            ${stateName ? `<span>${stateName}</span>` : ""}
            <span class="update-read-cue">Read full update →</span>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const sorted = [...RELAW_DATA.cases].sort((a, b) => new Date(b.date) - new Date(a.date));
    feed.innerHTML = sorted.map(rowHtml).join("");
  }

  render();
})();
