/* CREdocket — account.html list of federal court filings that matched the
   signed-in user's portfolio (rows written by the ingest-court-filings
   Edge Function; RLS limits each user to their own). */
(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  const listEl = document.getElementById("filing-matches-list");
  const countEl = document.getElementById("filing-matches-count");
  if (!sb || !listEl) return;

  const KIND_LABELS = { bankruptcy_ch11: "Chapter 11 petition", civil: "Federal civil suit", sec_8k: "SEC Form 8-K" };
  const STATE_PREFIXES = ["https://hover.hillsclerk.com/", "https://jpwebsite.harriscountytx.gov/"];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Only ever link to the hosts the ingest function itself enforces.
  const ALLOWED_PREFIXES = ["https://www.courtlistener.com/docket/", "https://www.sec.gov/Archives/edgar/data/"].concat(STATE_PREFIXES);
  function safeDocketUrl(url) {
    return typeof url === "string" && ALLOWED_PREFIXES.some((p) => url.indexOf(p) === 0) ? url : null;
  }

  function matchCard(m) {
    const f = m.court_filings || {};
    const e = m.portfolio_entities || {};
    const url = safeDocketUrl(f.docket_url);
    const isSec = f.filing_type === "sec_8k";
    const isState = typeof f.docket_url === "string" && STATE_PREFIXES.some((p) => f.docket_url.indexOf(p) === 0);
    const confidence = m.confidence === "exact"
      ? `<span class="mono" style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em;">High confidence</span>`
      : `<span class="mono text-muted" style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em;">Possible match — confirm</span>`;
    return `
      <div class="card reveal" style="margin-bottom:12px; padding:16px 20px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap;">
          <span style="font-weight:600; font-size:14px;">${escapeHtml(e.entity_name || "Removed entity")}</span>
          ${confidence}
        </div>
        <p style="font-size:13.5px; margin-top:6px;">${escapeHtml(isState ? "State court civil filing" : (KIND_LABELS[f.filing_type] || "Filing"))}: ${escapeHtml(f.case_name)}</p>
        <p class="text-muted" style="font-size:12.5px; margin-top:4px;">${isSec ? escapeHtml(f.docket_number) : `${escapeHtml(f.court_name)}${f.docket_number ? `, No. ${escapeHtml(f.docket_number)}` : ""}`} · filed ${escapeHtml(f.date_filed)} · matched name: ${escapeHtml(m.matched_party)}</p>
        <p class="text-muted" style="font-size:12px; margin-top:4px;">Stored ${fmtStamp(f.ingested_at)} · matched ${fmtStamp(m.created_at)} · ${m.emailed_at ? `emailed ${fmtStamp(m.emailed_at)}` : "email pending"}</p>
        ${isSec ? `<p class="text-muted" style="font-size:12px; margin-top:4px;">An 8-K item names the type of event, not its cause — read the filing before drawing a conclusion.</p>` : ""}
        ${url ? `<p style="font-size:12.5px; margin-top:6px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${isSec ? "View filing on SEC EDGAR" : isState ? "Search this case number on the clerk's site" : "View docket on CourtListener"}</a></p>` : ""}
      </div>`;
  }

  // The same three timestamps the public alert log reports, by name here
  // because this list is the subscriber's own.
  function fmtStamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function render() {
    return sb
      .from("filing_matches")
      .select("id, confidence, matched_party, created_at, emailed_at, court_filings(ingested_at, filing_type, case_name, court_name, docket_number, date_filed, docket_url), portfolio_entities(entity_name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          listEl.innerHTML = `<p class="text-muted">Couldn't load federal filing matches — try refreshing.</p>`;
          return;
        }
        if (countEl) countEl.textContent = data.length;
        if (!data.length) {
          listEl.innerHTML = `<p class="text-muted" style="font-size:13px;">No filings have matched your portfolio yet. New Chapter 11 petitions, federal suits, SEC 8-K event filings and covered state-court cases are checked twice a day.</p>`;
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
