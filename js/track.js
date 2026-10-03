/* Engagement events -> public.site_events (supabase/migrations/
   20261003_site_events.sql). No cookies, IP, user id, names or search
   text: a random per-tab session id, the page path, the referring domain,
   and for some events a matter id or a short detail word. Also forwarded
   to Vercel Analytics custom events when the plan supports them.

   window.RELAW_TRACK(event, {caseId, detail}). A page_view is sent once
   per page load. Bots that announce themselves and local previews are
   skipped. */
(function () {
  const ENDPOINT = "https://ribmcdyoydhmafnyfhpp.supabase.co/rest/v1/site_events";
  const KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const off = navigator.webdriver || /bot|crawl|spider|slurp|headless/i.test(navigator.userAgent) ||
    !/(^|\.)credocket\.com$/.test(location.hostname);

  let session = "";
  try {
    session = sessionStorage.getItem("credocket_session") || "";
    if (!session) { session = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem("credocket_session", session); }
  } catch (e) { session = Math.random().toString(36).slice(2, 12); }

  let referrer = null;
  try {
    const utm = new URLSearchParams(location.search).get("utm_source");
    const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
    if (utm) referrer = ("utm:" + utm).slice(0, 100);
    else if (host && !/(^|\.)credocket\.com$/.test(host)) referrer = host.slice(0, 100);
  } catch (e) { /* no referrer */ }

  function signedIn() {
    try { return !!(window.RELAW_AUTH && window.RELAW_AUTH.getSession && window.RELAW_AUTH.getSession()); } catch (e) { return null; }
  }

  function track(event, opts) {
    opts = opts || {};
    if (window.va) { try { window.va("event", { name: event, data: { page: location.pathname, detail: opts.detail || "" } }); } catch (e) { /* plan without custom events */ } }
    if (off) return;
    const row = {
      event,
      page: location.pathname.slice(0, 200),
      case_id: opts.caseId ? String(opts.caseId).slice(0, 40) : null,
      detail: opts.detail ? String(opts.detail).slice(0, 60) : null,
      referrer,
      session,
      signed_in: signedIn(),
    };
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(row),
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* never let tracking break the page */ }
  }

  window.RELAW_TRACK = track;
  const m = /^\/matters\/(live-\d+)\.html$/.exec(location.pathname);
  track(m ? "matter_page_view" : "page_view", m ? { caseId: m[1] } : {});

  // Outbound clicks on sources and dockets, anywhere on the site.
  document.addEventListener("click", function (e) {
    const a = e.target.closest && e.target.closest("a[href^='http']");
    if (!a || /credocket\.com/.test(a.hostname)) return;
    if (a.closest(".matter-sources, .primary-source-link")) track("source_click", { detail: a.hostname.replace(/^www\./, "").slice(0, 60) });
  });
})();
