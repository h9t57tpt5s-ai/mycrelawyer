/* =========================================================
   CREdocket — Procedural city spotlight
   -----------------------------------------------------------
   Original, hand-generated skyline illustrations (not photos)
   shown when a state is selected on the jurisdiction map.
   Each state gets a deterministic-but-varied skyline seeded
   from its USPS code, paired with its major CRE market's name.
   ========================================================= */

(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* Largest / most CRE-relevant metro per state, for the spotlight caption. */
  const MAJOR_CITY = {
    AL: "Birmingham", AK: "Anchorage", AZ: "Phoenix", AR: "Little Rock", CA: "Los Angeles",
    CO: "Denver", CT: "Stamford", DE: "Wilmington", FL: "Miami", GA: "Atlanta",
    HI: "Honolulu", ID: "Boise", IL: "Chicago", IN: "Indianapolis", IA: "Des Moines",
    KS: "Wichita", KY: "Louisville", LA: "New Orleans", ME: "Portland", MD: "Baltimore",
    MA: "Boston", MI: "Detroit", MN: "Minneapolis", MS: "Jackson", MO: "Kansas City",
    MT: "Billings", NE: "Omaha", NV: "Las Vegas", NH: "Manchester", NJ: "Newark",
    NM: "Albuquerque", NY: "New York City", NC: "Charlotte", ND: "Fargo", OH: "Columbus",
    OK: "Oklahoma City", OR: "Portland", PA: "Philadelphia", RI: "Providence", SC: "Charleston",
    SD: "Sioux Falls", TN: "Nashville", TX: "Houston", UT: "Salt Lake City", VT: "Burlington",
    VA: "Richmond", WA: "Seattle", WV: "Charleston", WI: "Milwaukee", WY: "Cheyenne",
    DC: "Washington"
  };

  /* Real, licensed photography (Pexels License — free for commercial use,
     no attribution required) for the handful of states whose flagship
     market we have a sourced photo for. Every other state falls back to
     the procedural skyline below. */
  const CITY_PHOTOS = {
    NY: { file: "img/photos/new-york.jpg", credit: "New York City" },
    IL: { file: "img/photos/chicago.jpg", credit: "Chicago" },
    CA: { file: "img/photos/los-angeles.jpg", credit: "Los Angeles" },
    TX: { file: "img/photos/houston.jpg", credit: "Houston" },
    FL: { file: "img/photos/miami.jpg", credit: "Miami" },
    WA: { file: "img/photos/seattle.jpg", credit: "Seattle" }
  };

  /* Deterministic PRNG seeded from the state code, so each state always
     renders the same skyline rather than a new random one every click. */
  function seededRandom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function el(tag, attrs, children) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => e.appendChild(c));
    return e;
  }

  function renderCityscape(containerId, code) {
    const host = document.getElementById(containerId);
    if (!host) return;

    const cityName = MAJOR_CITY[code] || (typeof RELAW_DATA !== "undefined" ? RELAW_DATA.states[code] : code);
    const stateName = typeof RELAW_DATA !== "undefined" ? RELAW_DATA.states[code] : code;

    const photo = CITY_PHOTOS[code];
    if (photo) {
      host.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.className = "city-spotlight-photo";
      const img = document.createElement("img");
      img.src = photo.file;
      img.alt = `${cityName}, ${stateName} skyline`;
      img.loading = "lazy";
      wrap.appendChild(img);
      const credit = document.createElement("span");
      credit.className = "city-spotlight-photo-credit";
      credit.textContent = "Photo: Pexels";
      wrap.appendChild(credit);
      host.appendChild(wrap);

      const caption = host.parentElement ? host.parentElement.querySelector(".cityscape-caption") : null;
      if (caption) caption.innerHTML = `<strong>${cityName}</strong>, ${stateName}`;
      return;
    }

    const rand = seededRandom(code);

    const width = 640;
    const height = 220;
    const baseline = height - 20;
    const buildingCount = 7 + Math.floor(rand() * 4); // 7-10
    const usableWidth = width - 40;
    const slotWidth = usableWidth / buildingCount;
    const heroIndex = Math.floor(rand() * buildingCount);

    const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height: "100%", "aria-hidden": "true" });

    const defs = el("defs", {}, [
      (() => {
        const grad = el("linearGradient", { id: "cityFade", x1: "0", y1: "0", x2: "0", y2: "1" });
        grad.appendChild(el("stop", { offset: "0", "stop-color": "white", "stop-opacity": "0" }));
        grad.appendChild(el("stop", { offset: "0.3", "stop-color": "white", "stop-opacity": "1" }));
        return grad;
      })()
    ]);
    const mask = el("mask", { id: "cityMask" }, [el("rect", { x: "0", y: "0", width, height, fill: "url(#cityFade)" })]);
    defs.appendChild(mask);
    svg.appendChild(defs);

    // faint ground line
    svg.appendChild(el("line", { x1: 20, y1: baseline, x2: width - 20, y2: baseline, stroke: "var(--border)", "stroke-width": 1 }));

    const buildingsGroup = el("g", { mask: "url(#cityMask)" });

    for (let i = 0; i < buildingCount; i++) {
      const isHero = i === heroIndex;
      const bw = slotWidth * (0.45 + rand() * 0.25);
      const bx = 20 + i * slotWidth + (slotWidth - bw) / 2;
      const bh = isHero ? 100 + rand() * 60 : 40 + rand() * 90;
      const by = baseline - bh;
      const fillVar = rand() > 0.5 ? "var(--surface)" : "var(--bg-elevated)";
      const strokeVar = isHero ? "var(--accent-deep)" : "var(--border)";

      buildingsGroup.appendChild(
        el("rect", { x: bx.toFixed(1), y: by.toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 2, fill: fillVar, stroke: strokeVar })
      );

      // windows: small grid, sparse
      const cols = Math.max(1, Math.floor(bw / 12));
      const rows = Math.max(1, Math.floor(bh / 16));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rand() > 0.62) continue;
          const wx = bx + 4 + c * (bw - 8) / cols;
          const wy = by + 8 + r * (bh - 16) / rows;
          buildingsGroup.appendChild(
            el("rect", {
              x: wx.toFixed(1), y: wy.toFixed(1), width: 4, height: 5,
              fill: "var(--accent)", opacity: (0.15 + rand() * 0.6).toFixed(2)
            })
          );
        }
      }

      if (isHero) {
        const cx = bx + bw / 2;
        svg.appendChild(el("line", { x1: cx.toFixed(1), y1: by.toFixed(1), x2: cx.toFixed(1), y2: (by - 16).toFixed(1), stroke: "var(--accent-deep)", "stroke-width": 1.6 }));
        const beacon = el("circle", { cx: cx.toFixed(1), cy: (by - 18).toFixed(1), r: 3, fill: "var(--accent-bright)" });
        beacon.appendChild((() => {
          const a = document.createElementNS(SVG_NS, "animate");
          a.setAttribute("attributeName", "opacity");
          a.setAttribute("values", "1;0.25;1");
          a.setAttribute("dur", (2 + rand()).toFixed(1) + "s");
          a.setAttribute("repeatCount", "indefinite");
          return a;
        })());
        svg.appendChild(beacon);
      }
    }

    svg.appendChild(buildingsGroup);
    host.innerHTML = "";
    host.appendChild(svg);

    const caption = host.parentElement ? host.parentElement.querySelector(".cityscape-caption") : null;
    if (caption) {
      caption.innerHTML = `<strong>${cityName}</strong>, ${stateName}`;
    }
  }

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.renderCityscape = renderCityscape;
  window.RELAW_UTILS.MAJOR_CITY = MAJOR_CITY;
})();
