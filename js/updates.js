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
    // The big date on this feed is the underlying legal event's own date --
    // this page's whole promise is "recent developments," so that has to
    // mean when something actually happened, not when we got around to
    // tracking it. Those two used to differ by only days or weeks, which
    // addedDate approximated fine; backfilling older state-court matters
    // to close Coverage Map gaps broke that assumption, so addedDate can no
    // longer drive what counts as an "update" here. Still shown as a small
    // secondary note when it meaningfully differs from the event date, for
    // transparency about when we actually surfaced it.
    const eventD = new Date(c.date + "T00:00:00");
    const added = c.addedDate ? new Date(c.addedDate + "T00:00:00") : null;
    const sameDate = c.addedDate === c.date;
    return `
      <article class="update-row" data-case-id="${c.id}">
        <div class="update-date">
          ${eventD.toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br>${eventD.getFullYear()}
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
            ${!sameDate && added ? `<span class="text-muted">Added to tracker: ${added.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>` : ""}
            <span class="update-read-cue">Read full update →</span>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const sorted = [...RELAW_DATA.cases].sort((a, b) => new Date(b.date) - new Date(a.date));

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
