/* Matter pages (matters/<id>.html, built by scripts/build_matter_pages.ts).
   These pages do not load js/data.js; this adds the parts that change
   between builds: corrections (js/corrections.json) and the latest
   federal docket entries (ops/docket-activity.json), plus the copy-link
   button. Same rendering as the tracker panel in js/main.js. */
(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const fmt = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const getJson = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const corr = document.getElementById("matter-corrections");
  if (corr) {
    getJson("/js/corrections.json").then((log) => {
      const mine = ((log && log.entries) || []).filter((e) => e.caseId === corr.dataset.matterId);
      corr.innerHTML = mine.map((e) => `
        <p class="detail-correction"><strong>Corrected ${fmt(e.date)}.</strong> ${esc(e.now)} <a href="/corrections.html">Corrections log</a></p>`).join("");
    });
  }

  const court = document.getElementById("matter-court");
  const m = court && /courtlistener\.com\/docket\/(\d+)\//.exec(court.dataset.docketUrl || "");
  if (m) {
    getJson("/ops/docket-activity.json").then((data) => {
      const d = data && data.dockets && data.dockets[m[1]];
      if (!d || (d.caseIds && d.caseIds.indexOf(court.dataset.matterId) === -1)) return;
      const entries = (d.entries || []).slice(0, 5);
      if (!entries.length && !d.dateTerminated) return;
      court.innerHTML = `
        <h2 class="matter-h2" style="margin-top:32px;">Latest court activity</h2>
        <p class="text-secondary docket-activity-note">From the ${esc(d.court || "federal")} docket${d.docketNumber ? " (No. " + esc(d.docketNumber) + ")" : ""} via CourtListener, checked ${data.updatedAt ? fmt(data.updatedAt.slice(0, 10)) : ""}. Entries reach CourtListener with some delay, and not every entry does.</p>
        ${d.dateTerminated ? `<p class="docket-activity-closed">The docket shows this case closed on ${fmt(d.dateTerminated)}.</p>` : ""}
        <ul class="docket-activity-list">${entries.map((e) => `
          <li><span class="docket-activity-date">${e.date ? fmt(e.date) : ""}</span><span class="docket-activity-text">${e.ruling ? '<span class="docket-activity-flag">Ruling</span>' : ""}${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.text || "Docket entry")}</a>` : esc(e.text || "Docket entry")}${e.number ? ` <span class="docket-activity-no">No. ${esc(e.number)}</span>` : ""}</span></li>`).join("")}
        </ul>`;
    });
  }

  const copy = document.getElementById("matter-copy");
  if (copy) {
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(copy.dataset.url); copy.textContent = "Link copied"; }
      catch (e) { window.prompt("Copy this link:", copy.dataset.url); }
      setTimeout(() => { copy.textContent = "Copy link"; }, 2500);
    });
  }
})();
