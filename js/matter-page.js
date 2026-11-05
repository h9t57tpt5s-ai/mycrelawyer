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

  const track = (event, opts) => { if (window.RELAW_TRACK) window.RELAW_TRACK(event, opts); };
  const matterId = (document.getElementById("matter-corrections") || {}).dataset ? document.getElementById("matter-corrections").dataset.matterId : null;
  document.querySelectorAll(".matter-share a").forEach((a) => a.addEventListener("click", () => track("share", { caseId: matterId, detail: a.textContent.trim().toLowerCase() })));

  // Sign-in prompt and alert box. auth.js loads after this script, so
  // RELAW_AUTH is looked up when the reader acts, not at load.
  const auth = () => window.RELAW_AUTH || null;
  const setStatus = (el, text, kind) => { el.textContent = text; el.className = "gate-form-status" + (kind ? " is-" + kind : ""); };

  const gateForm = document.getElementById("matter-gate-form");
  if (gateForm) {
    gateForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("matter-gate-status");
      if (!auth()) { setStatus(status, "Sign-in isn't available right now. Try again in a moment.", "error"); return; }
      const btn = gateForm.querySelector("button"); btn.disabled = true; setStatus(status, "Sending…");
      const res = await auth().sendMagicLink(document.getElementById("matter-gate-email").value, {
        caseId: matterId, redirectTo: location.origin + location.pathname,
      });
      btn.disabled = false;
      setStatus(status, res.ok ? "Check your inbox. The link brings you back to this write-up, signed in." : res.error, res.ok ? "success" : "error");
    });
  }

  // Full write-up on the page (2026-11-04): it is in the HTML for search
  // engines and readers without JavaScript; signed-out readers past their
  // 10 free write-ups this month (js/auth.js checkGate, counted in the
  // browser) see the first paragraph and the free-account box instead.
  // Fails open: if auth.js never loads or errors, the write-up stays.
  const full = document.getElementById("matter-full");
  if (full) {
    const note = document.getElementById("matter-free-note");
    const gateCard = document.getElementById("matter-full-gate");
    let waited = 0;
    const applyGate = () => {
      const a = auth();
      if (!a || !a.checkGate) { if (waited++ < 15) setTimeout(applyGate, 400); return; }
      a.checkGate(matterId).then((state) => {
        if (state.status === "ok") {
          if (state.anonymous && note) {
            note.innerHTML = `<span>${state.used} of ${state.limit} free write-ups read this month.</span> <button type="button" class="link-btn" id="matter-free-signup">Create a free account</button> for unlimited reading and email alerts.`;
            note.hidden = false;
            const su = document.getElementById("matter-free-signup");
            if (su) su.addEventListener("click", () => a.openSignInModal && a.openSignInModal(matterId));
          }
          track("full_read", { caseId: matterId, detail: "matter page " + (state.anonymous ? `free ${state.used}/${state.limit}` : "account") });
        } else if (state.status === "not-logged-in") {
          full.classList.add("is-gated");
          if (gateCard) gateCard.hidden = false;
          track("gate_shown", { caseId: matterId, detail: "matter page " + (state.reason || state.status) });
        }
      }).catch(() => { /* fail open */ });
    };
    applyGate();
  }

  const alertBox = document.querySelector("[data-alert-box]");
  if (alertBox) {
    let watch = null;
    try { watch = JSON.parse(alertBox.dataset.watchlist); } catch (e) { watch = null; }
    const form = alertBox.querySelector("[data-alert-form]");
    const input = form.querySelector("input");
    const status = alertBox.querySelector("[data-alert-status]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!auth() || !watch) { setStatus(status, "Alerts aren't available right now. Try again in a moment.", "error"); return; }
      setStatus(status, "Saving…");
      if (auth().getSession()) {
        const res = await auth().createWatchlist(watch);
        setStatus(status, res.ok ? (res.existed ? "You already have this alert." : "Alert created. Manage it on your account page.") : res.error, res.ok ? "success" : "error");
      } else {
        track("watchlist_cta", { caseId: matterId, detail: "email" });
        const res = await auth().sendMagicLink(input.value, { watchlist: watch });
        setStatus(status, res.ok ? "Check your inbox. Your alert is created when you click the sign-in link." : res.error, res.ok ? "success" : "error");
      }
    });
    // Signed-in readers: no email field, one-click alert, straight to the full matter.
    let tries = 0;
    const adapt = () => {
      const session = auth() && auth().getSession();
      if (session) {
        input.hidden = true; form.querySelector("button").textContent = "Create this alert";
      } else if (tries++ < 10) setTimeout(adapt, 500);
    };
    window.addEventListener("load", adapt);
  }

  // "Email me when the court rules in this case" (matter pages with a
  // CourtListener docket, and chapter-11/ pages). Needs the free account;
  // signed-out readers get a sign-in link and the follow is saved on return.
  const followBox = document.querySelector("[data-follow-box]");
  if (followBox) {
    let follow = null;
    try { follow = JSON.parse(followBox.dataset.follow); } catch (e) { follow = null; }
    const form = followBox.querySelector("[data-follow-form]");
    const input = form.querySelector("input");
    const btn = form.querySelector("button");
    const status = followBox.querySelector("[data-follow-status]");
    let following = false;
    const show = () => {
      const signedIn = !!(auth() && auth().getSession());
      input.hidden = signedIn;
      btn.textContent = following ? "Stop following" : "Follow this case";
      btn.className = following ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm";
    };
    const refresh = async () => {
      if (auth() && auth().getSession() && follow) following = await auth().isFollowing(follow.docketId);
      show();
      if (following && !status.textContent) setStatus(status, "You're following this case. We'll email you when the court rules.", "success");
    };
    if (/[?&]unfollowed=1\b/.test(location.search)) setStatus(status, "You've stopped following this case.", "success");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!auth() || !follow) { setStatus(status, "Following isn't available right now. Try again in a moment.", "error"); return; }
      btn.disabled = true;
      if (auth().getSession()) {
        const res = following ? await auth().unfollowDocket(follow.docketId) : await auth().followDocket(follow);
        if (res.ok) {
          following = !following;
          setStatus(status, following ? "You're following this case. We'll email you when the court rules." : "You've stopped following this case.", "success");
        } else setStatus(status, res.error, "error");
        show();
      } else {
        setStatus(status, "Sending…");
        const res = await auth().sendMagicLink(input.value, { follow, redirectTo: location.origin + location.pathname });
        setStatus(status, res.ok ? "Check your inbox. You'll be following this case once you click the sign-in link." : res.error, res.ok ? "success" : "error");
      }
      btn.disabled = false;
    });
    document.addEventListener("relaw:follows-changed", refresh);
    let tries = 0;
    const wait = () => { if (auth() && auth().getSession()) refresh(); else if (tries++ < 10) setTimeout(wait, 500); };
    window.addEventListener("load", wait);
  }

  const copy = document.getElementById("matter-copy");
  if (copy) {
    copy.addEventListener("click", async () => {
      track("share", { caseId: matterId, detail: "copy" });
      try { await navigator.clipboard.writeText(copy.dataset.url); copy.textContent = "Link copied"; }
      catch (e) { window.prompt("Copy this link:", copy.dataset.url); }
      setTimeout(() => { copy.textContent = "Copy link"; }, 2500);
    });
  }
})();
