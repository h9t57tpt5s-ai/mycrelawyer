/* =========================================================
   CREdocket — Distress Radar (distress-radar.html)
   -----------------------------------------------------------
   One map and one feed for every distress record the site
   publishes: Texas foreclosure postings, CMBS loans in trouble,
   real estate Chapter 11 petitions, federal CRE lawsuits, New York
   City recorded distress documents and the tracker's lender-suit
   write-ups. Data: js/radar-data.json and js/radar-geo.json, both
   written by scripts/build_distress_radar.ts. Filters live in the
   URL (?kind=cmbs,foreclosure&state=TX&days=90&type=Office&q=)
   so any view can be shared or bookmarked.
   ========================================================= */
(function () {
  "use strict";

  const KINDS = {
    foreclosure: { label: "Foreclosure postings", short: "Foreclosure", color: "#c26a00" },
    cmbs: { label: "CMBS loans in trouble", short: "CMBS", color: "#b3261e" },
    nyc: { label: "NYC recorded distress", short: "NYC record", color: "#d14d8b" },
    bankruptcy: { label: "Chapter 11 petitions", short: "Chapter 11", color: "#7a3fd1" },
    litigation: { label: "Lender suits (tracker)", short: "Lender suit", color: "#1b2e99" },
    lawsuit: { label: "Federal CRE lawsuits", short: "Federal suit", color: "#3d7d9a" },
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
  const day = (iso) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const todayIso = new Date().toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

  let DATA = [], GEO = null, STATE_NAMES = {};
  const params = new URLSearchParams(location.search);
  const state = {
    kinds: new Set((params.get("kind") || Object.keys(KINDS).join(",")).split(",").filter((k) => KINDS[k])),
    st: (params.get("state") || "").toUpperCase(),
    days: parseInt(params.get("days") || "90", 10),
    type: params.get("type") || "",
    q: params.get("q") || "",
    shown: 60,
  };

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.kinds.size !== Object.keys(KINDS).length) p.set("kind", [...state.kinds].join(","));
    if (state.st) p.set("state", state.st);
    if (state.days !== 90) p.set("days", String(state.days));
    if (state.type) p.set("type", state.type);
    if (state.q) p.set("q", state.q);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  // Records in the time window, before the kind/state filters, so the
  // tiles and the map always show what each filter would add.
  function inWindow(r) {
    if (state.days && r.date < daysAgo(state.days)) return false;
    if (state.type && r.propertyType !== state.type) return false;
    if (state.q) {
      const hay = (r.title + " " + r.detail + " " + r.city + " " + r.state + " " + r.propertyType).toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }
  const passes = (r) => inWindow(r) && state.kinds.has(r.kind) && (!state.st || r.state === state.st);

  function renderTiles() {
    const base = DATA.filter((r) => inWindow(r) && (!state.st || r.state === state.st));
    $("radar-tiles").innerHTML = Object.keys(KINDS).map((k) => {
      const rows = base.filter((r) => r.kind === k);
      if (!rows.length && !DATA.some((r) => r.kind === k)) return "";
      const amt = rows.reduce((s, r) => s + (r.amount && r.kind !== "litigation" ? r.amount : 0), 0);
      const on = state.kinds.has(k);
      return `<button type="button" class="rt-tile${on ? " is-on" : ""}" data-kind="${k}" aria-pressed="${on}">
        <span class="rt-dot" style="background:${KINDS[k].color}"></span>
        <span class="rt-n">${rows.length.toLocaleString("en-US")}</span>
        <span class="rt-l">${esc(KINDS[k].label)}</span>
        <span class="rt-a">${amt ? money(amt) + " in loans" : "&nbsp;"}</span>
      </button>`;
    }).join("");
  }

  function renderMap() {
    const svg = $("radar-map");
    if (!GEO) return;
    const rows = DATA.filter((r) => inWindow(r) && state.kinds.has(r.kind));
    const counts = {};
    rows.forEach((r) => { if (r.state) counts[r.state] = (counts[r.state] || 0) + 1; });
    const max = Math.max(1, ...Object.values(counts));
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${GEO.width} ${GEO.height}`);
    const gStates = document.createElementNS(SVGNS, "g");
    GEO.states.forEach((s) => {
      const n = counts[s.abbr] || 0;
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", s.d);
      p.setAttribute("class", "rm-state" + (state.st === s.abbr ? " is-sel" : "") + (n ? "" : " is-zero"));
      p.style.setProperty("--heat", n ? (0.12 + 0.78 * Math.sqrt(n / max)).toFixed(3) : "0");
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", `${s.name}: ${n} record${n === 1 ? "" : "s"}`);
      const t = document.createElementNS(SVGNS, "title");
      t.textContent = `${s.name}: ${n} record${n === 1 ? "" : "s"}`;
      p.appendChild(t);
      const pick = () => { state.st = state.st === s.abbr ? "" : s.abbr; state.shown = 60; update(); };
      p.addEventListener("click", pick);
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      gStates.appendChild(p);
    });
    svg.appendChild(gStates);
    const gPts = document.createElementNS(SVGNS, "g");
    const fresh = daysAgo(14);
    rows.filter((r) => r.x !== undefined && (!state.st || r.state === state.st))
      .sort((a, b) => (a.amount || 0) < (b.amount || 0) ? 1 : -1)
      .forEach((r) => {
        const a = document.createElementNS(SVGNS, "a");
        a.setAttribute("href", r.url);
        const rad = r.amount ? Math.max(4, Math.min(16, 2.2 * Math.sqrt(r.amount / 1e6))) : 4.5;
        if (r.date >= fresh) {
          const ring = document.createElementNS(SVGNS, "circle");
          ring.setAttribute("cx", r.x); ring.setAttribute("cy", r.y); ring.setAttribute("r", rad);
          ring.setAttribute("class", "rm-ping");
          ring.style.stroke = KINDS[r.kind].color;
          a.appendChild(ring);
        }
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", r.x); c.setAttribute("cy", r.y); c.setAttribute("r", rad);
        c.setAttribute("class", "rm-pt");
        c.style.fill = KINDS[r.kind].color;
        const t = document.createElementNS(SVGNS, "title");
        t.textContent = `${r.title}, ${r.city}, ${r.state}${r.amount ? " · " + money(r.amount) + " " + r.amountLabel : ""} · ${KINDS[r.kind].short}`;
        c.appendChild(t);
        a.appendChild(c);
        gPts.appendChild(a);
      });
    svg.appendChild(gPts);
  }

  function renderLeaders() {
    const rows = DATA.filter((r) => inWindow(r) && state.kinds.has(r.kind) && r.state);
    const by = {};
    rows.forEach((r) => {
      by[r.state] = by[r.state] || { n: 0, amt: 0, kinds: {} };
      by[r.state].n++;
      if (r.amount && r.kind !== "litigation") by[r.state].amt += r.amount;
      by[r.state].kinds[r.kind] = (by[r.state].kinds[r.kind] || 0) + 1;
    });
    const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const max = top.length ? top[0][1].n : 1;
    $("radar-leaders").innerHTML = top.length ? top.map(([st, v]) => `
      <li><button type="button" class="rl-row${state.st === st ? " is-sel" : ""}" data-state="${st}">
        <span class="rl-name">${esc(STATE_NAMES[st] || st)}</span>
        <span class="rl-bar">${Object.keys(KINDS).filter((k) => v.kinds[k]).map((k) =>
          `<span style="width:${(100 * v.kinds[k] / max).toFixed(1)}%;background:${KINDS[k].color}" title="${v.kinds[k]} ${esc(KINDS[k].label.toLowerCase())}"></span>`).join("")}</span>
        <span class="rl-n">${v.n}</span>
      </button></li>`).join("") : `<li class="rl-empty">No records match these filters.</li>`;
  }

  function renderFeed() {
    const rows = DATA.filter(passes);
    const amt = rows.reduce((s, r) => s + (r.amount && r.kind !== "litigation" ? r.amount : 0), 0);
    $("radar-summary").innerHTML = `<strong>${rows.length.toLocaleString("en-US")}</strong> record${rows.length === 1 ? "" : "s"}` +
      (state.st ? ` in <strong>${esc(STATE_NAMES[state.st] || state.st)}</strong>` : "") +
      (state.days ? ` from the last ${state.days} days` : "") +
      (amt ? ` · <strong>${money(amt)}</strong> in loan balances and original loan amounts stated in the records` : "") +
      (state.st ? ` · <button type="button" class="linklike" id="radar-clear-state">All states</button>` : "");
    const shown = rows.slice(0, state.shown);
    let last = "";
    $("radar-feed").innerHTML = shown.map((r) => {
      const k = KINDS[r.kind];
      const head = r.date !== last ? `<li class="rf-day">${day(r.date)}${r.date === todayIso ? " · today" : ""}</li>` : "";
      last = r.date;
      const loc = [r.city, r.state].filter(Boolean).join(", ");
      const ext = /^https?:/.test(r.url);
      return head + `<li class="rf-row">
        <span class="rf-kind" style="--k:${k.color}">${esc(k.short)}</span>
        <div class="rf-main">
          <a class="rf-title" href="${esc(r.url)}"${ext ? ' rel="noopener" target="_blank"' : ""}>${esc(r.title)}</a>
          <div class="rf-meta">${[loc, r.propertyType].filter(Boolean).map(esc).join(" · ")}${r.future && r.future >= todayIso ? ` · <strong class="rf-soon">sale ${day(r.future)}</strong>` : ""}</div>
          <div class="rf-detail">${esc(r.detail)}</div>
        </div>
        <div class="rf-amt">${r.amount ? `<strong>${money(r.amount)}</strong><span>${esc(r.amountLabel)}</span>` : ""}</div>
      </li>`;
    }).join("") || `<li class="rf-empty">Nothing matches these filters. Widen the time window or turn on more record types.</li>`;
    $("radar-more").hidden = rows.length <= state.shown;
    $("radar-more").textContent = `Show more (${(rows.length - state.shown).toLocaleString("en-US")} left)`;
    const cl = $("radar-clear-state");
    if (cl) cl.addEventListener("click", () => { state.st = ""; update(); });
  }

  function renderAlertCopy() {
    const kinds = [...state.kinds].map((k) => KINDS[k].label.toLowerCase());
    $("ra-scope").textContent = `${state.st ? STATE_NAMES[state.st] || state.st : "every state"}${state.type ? `, ${state.type.toLowerCase()} properties` : ""}: ${
      kinds.length === Object.keys(KINDS).length ? "every record type" : kinds.join(", ")}`;
  }

  function update() {
    syncUrl();
    renderTiles(); renderMap(); renderLeaders(); renderFeed(); renderAlertCopy();
    $("radar-days").value = String(state.days);
    $("radar-type").value = state.type;
  }

  function wire() {
    $("radar-tiles").addEventListener("click", (e) => {
      const b = e.target.closest("[data-kind]");
      if (!b) return;
      const k = b.dataset.kind;
      // First click on a full set isolates that kind; later clicks toggle.
      if (state.kinds.size === Object.keys(KINDS).length) state.kinds = new Set([k]);
      else if (state.kinds.has(k)) { state.kinds.delete(k); if (!state.kinds.size) state.kinds = new Set(Object.keys(KINDS)); }
      else state.kinds.add(k);
      state.shown = 60; update();
    });
    $("radar-leaders").addEventListener("click", (e) => {
      const b = e.target.closest("[data-state]");
      if (!b) return;
      state.st = state.st === b.dataset.state ? "" : b.dataset.state; state.shown = 60; update();
    });
    $("radar-days").addEventListener("change", (e) => { state.days = parseInt(e.target.value, 10); state.shown = 60; update(); });
    $("radar-type").addEventListener("change", (e) => { state.type = e.target.value; state.shown = 60; update(); });
    let t;
    $("radar-q").value = state.q;
    $("radar-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); state.shown = 60; update(); }, 200); });
    $("radar-more").addEventListener("click", () => { state.shown += 60; renderFeed(); });
    $("radar-reset").addEventListener("click", () => {
      state.kinds = new Set(Object.keys(KINDS)); state.st = ""; state.days = 90; state.type = ""; state.q = ""; $("radar-q").value = ""; update();
    });

    const form = $("radar-alert-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("ra-msg"), btn = form.querySelector("button[type=submit]");
      const email = $("ra-email").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
      btn.disabled = true; msg.textContent = "Saving…";
      try {
        const r = await fetch("https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/newsletter", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "subscribe", email, source: "distress-radar",
            radar: { states: state.st ? [state.st] : [], kinds: [...state.kinds], propertyTypes: state.type ? [state.type] : [] } }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) {
          msg.textContent = j.already ? "You're already subscribed. Your radar alert settings were saved." : "Check your inbox: one click confirms your radar alerts.";
          try { window.va && window.va("event", { name: "radar_alert_signup" }); } catch (_) {}
          form.reset();
        } else msg.textContent = j.error || "Couldn't save that. Try again in a minute.";
      } catch (_) { msg.textContent = "Couldn't reach the server. Try again in a minute."; }
      btn.disabled = false;
    });
  }

  Promise.all([fetch("js/radar-data.json").then((r) => r.json()), fetch("js/radar-geo.json").then((r) => r.json())])
    .then(([d, g]) => {
      DATA = d.records; GEO = g;
      g.states.forEach((s) => { STATE_NAMES[s.abbr] = s.name; });
      const types = [...new Set(DATA.map((r) => r.propertyType).filter(Boolean))].sort();
      $("radar-type").innerHTML = `<option value="">All property types</option>` + types.map((t) => `<option>${esc(t)}</option>`).join("");
      $("radar-updated").textContent = day(d.generated.slice(0, 10));
      wire(); update();
    })
    .catch(() => { $("radar-feed").innerHTML = `<li class="rf-empty">The radar data didn't load. Reload the page to try again.</li>`; });
})();
