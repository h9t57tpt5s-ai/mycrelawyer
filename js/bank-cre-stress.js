/* =========================================================
   CREdocket — Bank CRE Stress (bank-cre-stress.html)
   -----------------------------------------------------------
   Every FDIC-insured bank over $1B in assets with $100M+ of
   commercial real estate loans: how much of that book is
   noncurrent, how that compares with a year earlier, and how
   concentrated the bank is in CRE. Data: js/bank-cre.json and
   ops/market-pulse.json, both written by
   scripts/pull_market_pulse.py from FDIC Call Report data and
   Federal Reserve series (via FRED). Nothing here is estimated.
   ========================================================= */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (n) => n >= 1e12 ? "$" + (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? "$" + (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M" : "$" + Math.round(n / 1e3) + "K";
  const pct = (v, d) => v == null ? "–" : v.toFixed(d == null ? 2 : d) + "%";
  const SMALL = /\b(Of|And|The|For|In|At)\b/g;
  const name = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(SMALL, (m) => m.toLowerCase())
    .replace(/\b(Na|N\.a\.|Fsb|Ssb|Usa|Tx|Ny|Ca|Nj|Pa|Il|Fl|Hsbc|Bmo|Td|Pnc|Bcb|Cibc|Ubs|Mufg|Bok|Ozk|Umb|Bnc)\b/g, (m) => m.toUpperCase())
    .replace(/&/g, " & ").replace(/\s+/g, " ").replace(/^./, (m) => m.toUpperCase());
  const place = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

  let BANKS = [], META = null;
  const st = { sort: "sh", dir: -1, state: "", min: 1e9, q: "", shown: 50 };

  function delta(b) { return b.ya == null ? null : b.sh - b.ya; }
  const COLS = {
    sh: (b) => b.sh, d: (b) => delta(b) == null ? -Infinity : delta(b), nc: (b) => b.nc, cre: (b) => b.cre, eq: (b) => b.eq || 0, a: (b) => b.a,
  };

  function rows() {
    const q = st.q.toLowerCase();
    return BANKS.filter((b) => b.a >= st.min && (!st.state || b.s === st.state) && (!q || (b.n + " " + b.c).toLowerCase().indexOf(q) !== -1))
      .sort((x, y) => st.dir * (COLS[st.sort](x) - COLS[st.sort](y)) || y.nc - x.nc);
  }

  function renderTable() {
    const r = rows();
    $("bk-count").textContent = `${r.length.toLocaleString("en-US")} bank${r.length === 1 ? "" : "s"}`;
    $("bk-body").innerHTML = r.slice(0, st.shown).map((b, i) => {
      const d = delta(b);
      const bar = Math.min(100, b.sh * 2.5);
      return `<tr>
        <td class="num muted">${i + 1}</td>
        <td><a href="https://banks.data.fdic.gov/bankfind-suite/bankfind/details/${b.cert}" rel="noopener" target="_blank" class="bk-name">${esc(name(b.n))}</a><div class="muted small">${esc(place(b.c))}, ${esc(b.s)} · ${money(b.a)} assets</div></td>
        <td class="num"><div class="bk-share"><span class="bk-bar"><i style="width:${bar.toFixed(1)}%"></i></span><strong>${pct(b.sh)}</strong></div></td>
        <td class="num ${d == null ? "muted" : d > 0.25 ? "up" : d < -0.25 ? "down" : "muted"}">${d == null ? "–" : (d > 0 ? "+" : "") + d.toFixed(2) + " pts"}</td>
        <td class="num">${money(b.nc)}</td>
        <td class="num">${money(b.cre)}</td>
        <td class="num">${pct(b.eq, 0)}</td>
        <td class="num small muted">${[["Constr.", b.con], ["Multifam.", b.mf], ["Other CRE", b.nnr]].filter((x) => x[1]).map((x) => `${x[0]} ${pct(x[1], 1)}`).join("<br>") || "–"}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="8" class="muted">No bank matches these filters.</td></tr>`;
    $("bk-more").hidden = r.length <= st.shown;
    document.querySelectorAll("[data-sort]").forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.sort === st.sort ? (st.dir < 0 ? "descending" : "ascending") : "none");
    });
    renderScatter(r);
  }

  // Concentration (non-owner-occupied CRE / equity) against the noncurrent
  // share: banks up and to the right have big CRE books going bad.
  function renderScatter(r) {
    const svg = $("bk-scatter");
    const W = 720, H = 380, L = 52, R = 16, T = 14, B = 44;
    const pts = r.filter((b) => b.eq != null && b.eq > 0);
    const xMax = 800, yMax = 12; // most banks sit under 5%; outliers are pinned to the top edge
    const x = (v) => L + (Math.min(v, xMax) / xMax) * (W - L - R), y = (v) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
    let g = `<rect x="${x(300)}" y="${T}" width="${x(xMax) - x(300)}" height="${y(3) - T}" class="sc-zone"/>`;
    for (let v = 0; v <= xMax; v += 200) g += `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" class="sc-grid"/><text x="${x(v)}" y="${H - B + 18}" class="sc-tick" text-anchor="middle">${v}%${v === xMax ? "+" : ""}</text>`;
    for (let v = 0; v <= yMax; v += 3) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="sc-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="sc-tick" text-anchor="end">${v}%${v === yMax ? "+" : ""}</text>`;
    g += `<text x="${(L + W - R) / 2}" y="${H - 6}" class="sc-axis" text-anchor="middle">Investor CRE loans as a share of the bank's equity</text>`;
    g += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" class="sc-axis" text-anchor="middle">CRE loans noncurrent</text>`;
    g += `<text x="${x(xMax) - 6}" y="${T + 16}" class="sc-zone-label" text-anchor="end">Concentrated and deteriorating</text>`;
    g += pts.map((b) => {
      const hot = b.eq >= 300 && b.sh >= 3;
      return `<a href="https://banks.data.fdic.gov/bankfind-suite/bankfind/details/${b.cert}" target="_blank" rel="noopener"><circle cx="${x(b.eq).toFixed(1)}" cy="${y(b.sh).toFixed(1)}" r="${Math.max(2.5, Math.min(11, Math.sqrt(b.cre / 1e8))).toFixed(1)}" class="sc-pt${hot ? " hot" : ""}"><title>${esc(name(b.n))} (${esc(b.s)}): ${pct(b.sh)} noncurrent; investor CRE ${pct(b.eq, 0)} of equity; ${money(b.cre)} CRE loans</title></circle></a>`;
    }).join("");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = g;
    const hot = pts.filter((b) => b.eq >= 300 && b.sh >= 3);
    $("bk-hot").innerHTML = hot.length
      ? `<strong>${hot.length}</strong> bank${hot.length === 1 ? "" : "s"} in this view hold investor CRE loans worth 300% or more of their equity <em>and</em> have 3% or more of their CRE loans noncurrent: ${hot.sort((a, b) => b.sh - a.sh).slice(0, 8).map((b) => esc(name(b.n))).join(", ")}${hot.length > 8 ? "…" : ""}.`
      : "No bank in this view combines investor CRE loans of 300% or more of equity with 3% or more noncurrent.";
  }

  function renderPulse(p) {
    const want = ["fdic-noncurrent-cre-rate", "fred-drcrelexfacbs", "fred-creacbw027sbog", "fred-dgs10", "fred-sublpdrcsn", "fred-corcrexfacbs"];
    const inds = want.map((id) => p.indicators.find((i) => i.id === id)).filter(Boolean);
    const fmt = (i, v) => /billion/i.test(i.unit) ? "$" + (v / 1000).toFixed(2) + "T" : /percent/i.test(i.unit) ? v.toFixed(2) + "%" : v.toFixed(1);
    $("pulse").innerHTML = inds.map((i) => {
      const c = (i.comparisons || []).find((x) => /year/i.test(x.label)) || (i.comparisons || [])[0];
      const d = c ? i.value - c.value : 0;
      return `<a class="pl-tile" href="${esc(i.sourceUrl)}" target="_blank" rel="noopener">
        <span class="pl-l">${esc(i.label)}</span>
        <span class="pl-v">${fmt(i, i.value)}</span>
        ${c ? `<span class="pl-c ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "•"} from ${fmt(i, c.value)} ${esc(c.label)}</span>` : ""}
        <span class="pl-s">${esc(i.period || i.asOf)}${i.stale ? " · not refreshed" : ""}</span>
      </a>`;
    }).join("");
  }

  function wire() {
    document.querySelectorAll("[data-sort]").forEach((th) => th.querySelector("button").addEventListener("click", () => {
      st.dir = st.sort === th.dataset.sort ? -st.dir : -1; st.sort = th.dataset.sort; st.shown = 50; renderTable();
    }));
    $("bk-state").addEventListener("change", (e) => { st.state = e.target.value; st.shown = 50; renderTable(); });
    $("bk-min").addEventListener("change", (e) => { st.min = +e.target.value; st.shown = 50; renderTable(); });
    let t; $("bk-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); st.shown = 50; renderTable(); }, 200); });
    $("bk-more").addEventListener("click", () => { st.shown += 50; renderTable(); });
  }

  Promise.all([fetch("js/bank-cre.json").then((r) => r.json()), fetch("ops/market-pulse.json").then((r) => r.json()).catch(() => null)])
    .then(([b, p]) => {
      BANKS = b.banks; META = b;
      $("bk-quarter").textContent = b.quarter;
      $("bk-total").textContent = BANKS.length.toLocaleString("en-US");
      const states = [...new Set(BANKS.map((x) => x.s))].sort();
      $("bk-state").innerHTML = `<option value="">All states</option>` + states.map((s) => `<option>${s}</option>`).join("");
      const worse = BANKS.filter((x) => x.ya != null && x.sh - x.ya > 0.25).length, better = BANKS.filter((x) => x.ya != null && x.ya - x.sh > 0.25).length;
      $("bk-trend").textContent = `${worse} of these banks have a larger share of CRE loans noncurrent than a year earlier, and ${better} a smaller one (changes over a quarter of a point).`;
      if (p) renderPulse(p);
      wire(); renderTable();
    })
    .catch(() => { $("bk-body").innerHTML = `<tr><td colspan="8">The bank data didn't load. Reload the page to try again.</td></tr>`; });
})();
