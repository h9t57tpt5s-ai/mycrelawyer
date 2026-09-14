/* =========================================================
   CREdocket — Updates page: chronological feed

   Two distinct sort modes, because "newest" is genuinely ambiguous here:
   - "added" (default): when CREdocket actually wrote about/surfaced the
     matter (addedDate). This is what a returning visitor checking "what's
     new since I last looked" actually wants -- and what the homepage's
     "New Today" pill (?recent=5) promises. Defaulting to event-date sort
     could show the same top handful of items for days at a stretch even
     though brand-new write-ups were added, since the daily research
     pipeline often surfaces older events (a ruling from months ago that
     just hit legal press) alongside genuinely fresh ones -- a visitor
     would see no change and reasonably conclude nothing happened.
   - "event": the underlying legal event's own date (date) -- a true
     chronological history of when things actually happened in the
     industry, for someone researching a timeline rather than checking
     for fresh content.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const feed = document.getElementById("updates-feed");
  if (!feed) return;

  const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c]));
  const statusMap = Object.fromEntries(RELAW_DATA.statuses.map((s) => [s.id, s]));

  let sortMode = "added";

  function rowHtml(c) {
    const cat = catMap[c.category];
    const status = statusMap[c.status];
    const isLive = c.source === "live";
    const stateName = c.state ? RELAW_DATA.states[c.state] : null;
    const eventD = new Date(c.date + "T00:00:00");
    const added = c.addedDate ? new Date(c.addedDate + "T00:00:00") : null;
    const sameDate = c.addedDate === c.date;

    const primaryDate = sortMode === "added" && added ? added : eventD;
    const secondaryHtml = sameDate
      ? ""
      : sortMode === "added"
        ? `<span class="text-muted">Event date: ${eventD.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>`
        : added
          ? `<span class="text-muted">Added to tracker: ${added.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>`
          : "";

    return `
      <article class="update-row" data-case-id="${c.id}">
        <div class="update-date">
          ${primaryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br>${primaryDate.getFullYear()}
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
            ${secondaryHtml}
            <span class="update-read-cue">Read full update →</span>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const sortKey = sortMode === "added" ? "addedDate" : "date";
    const sorted = [...RELAW_DATA.cases].sort((a, b) => new Date(b[sortKey] || b.date) - new Date(a[sortKey] || a.date));

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

  document.querySelectorAll(".sort-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-sort");
      if (mode === sortMode) return;
      sortMode = mode;
      document.querySelectorAll(".sort-toggle-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      render();
    });
  });

  render();
})();
