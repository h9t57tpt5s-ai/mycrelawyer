/* CREdocket — account.html list of federal court filings that matched the
   signed-in user's portfolio (rows written by the ingest-court-filings
   Edge Function; RLS limits each user to their own). */
(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  const listEl = document.getElementById("filing-matches-list");
  const countEl = document.getElementById("filing-matches-count");
  if (!sb || !listEl) return;

  const KIND_LABELS = { bankruptcy_ch11: "Chapter 11 petition", civil: "Federal civil suit" };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Only ever link to the docket host the ingest function itself enforces.
  function safeDocketUrl(url) {
    return typeof url === "string" && url.indexOf("https://www.courtlistener.com/docket/") === 0 ? url : null;
  }

  function matchCard(m) {
    const f = m.court_filings || {};
    const e = m.portfolio_entities || {};
    const url = safeDocketUrl(f.docket_url);
    const confidence = m.confidence === "exact"
      ? `<span class="mono" style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em;">High confidence</span>`
      : `<span class="mono text-muted" style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em;">Possible match — confirm</span>`;
    return `
      <div class="card reveal" style="margin-bottom:12px; padding:16px 20px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <span style="font-weight:600; font-size:14px;">${escapeHtml(e.entity_name || "Removed entity")}</span>
          ${confidence}
        </div>
        <p style="font-size:13.5px; margin-top:6px;">${escapeHtml(KIND_LABELS[f.filing_type] || "Federal filing")}: ${escapeHtml(f.case_name)}</p>
        <p class="text-muted" style="font-size:12.5px; margin-top:4px;">${escapeHtml(f.court_name)}${f.docket_number ? `, No. ${escapeHtml(f.docket_number)}` : ""} · filed ${escapeHtml(f.date_filed)} · matched party: ${escapeHtml(m.matched_party)}</p>
        ${url ? `<p style="font-size:12.5px; margin-top:6px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View docket on CourtListener</a></p>` : ""}
      </div>`;
  }

  function render() {
    return sb
      .from("filing_matches")
      .select("id, confidence, matched_party, created_at, court_filings(filing_type, case_name, court_name, docket_number, date_filed, docket_url), portfolio_entities(entity_name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          listEl.innerHTML = `<p class="text-muted">Couldn't load federal filing matches — try refreshing.</p>`;
          return;
        }
        if (countEl) countEl.textContent = data.length;
        if (!data.length) {
          listEl.innerHTML = `<p class="text-muted" style="font-size:13px;">No federal filings have matched your portfolio yet. New Chapter 11 petitions and federal suits are checked once a day.</p>`;
          return;
        }
        listEl.innerHTML = data.map(matchCard).join("");
        listEl.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
      });
  }

  function renderAccountState() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (session && session.user) render();
  }

  sb.auth.getSession().then(renderAccountState);
  sb.auth.onAuthStateChange(renderAccountState);
})();
