/* =========================================================
   CREdocket — Trending indicator
   Logs a click each time a case is opened (anonymous, no login
   required — separate from the paywall's case_views tracking),
   then marks genuinely popular matters (top 5 by clicks in the
   last 7 days, minimum 3 clicks) with a 🔥 badge wherever a case
   card renders, across any page.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const MIN_CLICKS_TO_TREND = 3;
  const CLICKED_KEY_PREFIX = "credocket_clicked_";
  let trendingIds = new Set();

  function badgeHtml() {
    return `<span class="badge badge-trending" title="Popular this week">🔥 Trending</span>`;
  }

  function applyBadges(root) {
    if (!trendingIds.size) return;
    (root || document).querySelectorAll(".case-card[data-case-id]").forEach((card) => {
      const id = card.getAttribute("data-case-id");
      if (!trendingIds.has(id)) return;
      if (card.querySelector(".badge-trending")) return;
      const top = card.querySelector(".case-card-top");
      if (top) top.insertAdjacentHTML("beforeend", badgeHtml());
    });
  }

  async function loadTrending() {
    try {
      const { data, error } = await sb
        .from("trending_cases")
        .select("case_id, click_count")
        .limit(5);
      if (error || !data) return;
      trendingIds = new Set(data.filter((r) => r.click_count >= MIN_CLICKS_TO_TREND).map((r) => r.case_id));
      applyBadges(document);
    } catch (e) {
      // Cosmetic feature only — fail silently.
    }
  }

  loadTrending();

  // Case-card grids render asynchronously at different times on different
  // pages (featured grid, full tracker, quarterly report, etc.) — rather
  // than hook every render call site, watch for new cards as they appear.
  const observer = new MutationObserver(() => applyBadges(document));
  observer.observe(document.body, { childList: true, subtree: true });

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.recordCaseClick = function (caseId) {
    const key = CLICKED_KEY_PREFIX + caseId;
    if (sessionStorage.getItem(key)) return; // one count per case per browser session
    sessionStorage.setItem(key, "1");
    sb.from("case_clicks").insert({ case_id: caseId }).then(() => {});
  };
})();
