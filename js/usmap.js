/* =========================================================
   CREdocket — US jurisdiction map
   -----------------------------------------------------------
   Renders real state border paths (see js/us-state-paths.js)
   with states that have tracked matters shown active/clickable/
   labeled, and states with none shown as a muted outline so the
   full country still reads correctly.
   ========================================================= */

(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, children) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    (children || []).forEach((c) => e.appendChild(c));
    return e;
  }

  function renderUsMap(containerId, onSelect) {
    const host = document.getElementById(containerId);
    if (!host || typeof RELAW_DATA === "undefined" || typeof US_STATE_PATHS === "undefined") return;
    host.innerHTML = "";

    const counts = {};
    RELAW_DATA.cases.forEach((c) => {
      if (!c.state) return;
      counts[c.state] = (counts[c.state] || 0) + 1;
    });
    const maxCount = Math.max(1, ...Object.values(counts));

    const svg = el("svg", {
      viewBox: US_MAP_VIEWBOX,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": "Map of tracked matters by US state"
    });

    Object.keys(US_STATE_PATHS).forEach((code) => {
      const s = US_STATE_PATHS[code];
      const count = counts[code] || 0;
      const active = count > 0;
      const stateName = RELAW_DATA.states[code] || code;

      const g = el("g", {
        class: active ? "state-path-group state-path-active" : "state-path-group state-path-inactive"
      });

      const opacity = active ? 0.45 + 0.55 * (count / maxCount) : 1;
      const path = el("path", {
        d: s.d,
        class: "state-path",
        style: active ? `fill-opacity:${opacity.toFixed(2)}` : ""
      });
      const title = el("title", {});
      title.textContent = active
        ? `${stateName} — ${count} tracked matter${count === 1 ? "" : "s"}`
        : `${stateName} — no tracked matters yet`;
      g.appendChild(path);
      g.appendChild(title);

      if (active) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("data-state", code);
        if (s.w > 26 && s.h > 16) {
          const label = el("text", {
            class: "state-label",
            x: s.cx, y: s.cy + 3.5,
            "text-anchor": "middle"
          });
          label.textContent = code;
          g.appendChild(label);
        }
        const activate = () => { if (typeof onSelect === "function") onSelect(code); };
        g.addEventListener("click", activate);
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
        });
      }

      svg.appendChild(g);
    });

    host.appendChild(svg);
  }

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.renderUsMap = renderUsMap;
})();
