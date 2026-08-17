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
    // The big date on this feed is when we ADDED the matter (matches the
    // page's own newest-first sort), not the underlying legal event's own
    // date — those can differ by days or weeks. The event date is still
    // shown, just as a smaller inline label, so nothing is lost.
    const added = new Date((c.addedDate || c.date) + "T00:00:00");
    const eventD = new Date(c.date + "T00:00:00");
    const sameDate = c.addedDate === c.date;
    return `
      <article class="update-row" data-case-id="${c.id}">
        <div class="update-date">
          ${added.toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br>${added.getFullYear()}
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
            ${!sameDate ? `<span class="text-muted">Event date: ${eventD.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
            <span class="update-read-cue">Read full update →</span>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const sorted = [...RELAW_DATA.cases].sort((a, b) => new Date(b.addedDate || b.date) - new Date(a.addedDate || a.date));

    // Optional ?recent=N — used by the homepage's "New Today" pill so it
    // points at just the latest handful of updates rather than the entire
    // tracker history. Absent (or invalid), the full feed renders as usual.
    const recentParam = parseInt(new URLSearchParams(window.location.search).get("recent"), 10);
    const limited = Number.isInteger(recentParam) && recentParam > 0;
    const list = limited ? sorted.slice(0, recentParam) : sorted;

    const note = document.getElementById("updates-recent-note");
    if (note) {
      if (limited) {
        note.style.display = "block";
        note.innerHTML = `Showing the ${list.length} most recent update${list.length === 1 ? "" : "s"}. <a href="updates.html" class="text-accent" style="display:inline;">View the full history &rarr;</a>`;
      } else {
        note.style.display = "none";
      }
    }

    feed.innerHTML = list.map(rowHtml).join("");
  }

  render();
})();
