/* =========================================================
   CREdocket — Animated litigation timeline (pure SVG, no deps)
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

  function renderTimeline(containerId, cases) {
    const host = document.getElementById(containerId);
    if (!host) return;
    host.innerHTML = "";

    if (!cases.length) {
      host.innerHTML = `<div class="empty-state"><p>No matters in the current filter to plot on the timeline.</p></div>`;
      return;
    }

    const categories = RELAW_DATA.categories;
    const laneOf = Object.fromEntries(categories.map((c, i) => [c.id, i]));

    const dates = cases.map((c) => new Date(c.date + "T00:00:00").getTime());
    let minDate = Math.min(...dates);
    let maxDate = Math.max(...dates);
    if (minDate === maxDate) { minDate -= 1000 * 60 * 60 * 24 * 30; maxDate += 1000 * 60 * 60 * 24 * 30; }
    const pad = (maxDate - minDate) * 0.06;
    minDate -= pad;
    maxDate += pad;

    const leftPad = 190;
    const rightPad = 50;
    const topPad = 26;
    const laneHeight = 62;
    const bottomAxis = 46;

    /* Adaptive month-axis tick interval: a label every single month reads
       fine over a few months but overlaps into an unreadable smear once the
       tracked range stretches past a year or two. Pick the smallest step
       (in months) from a fixed set of "round" intervals that keeps the
       total number of rendered labels within a comfortable range, then size
       the SVG so each rendered label — not each raw month — gets enough
       breathing room. The container scrolls horizontally, so it's safe to
       grow wider rather than cram labels together. */
    const monthSpan = Math.max(1, Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24 * 30.44)));
    const TICK_STEPS = [1, 2, 3, 6, 12, 24, 36];
    const MAX_LABELS = 11;
    const tickStepMonths = TICK_STEPS.find((step) => monthSpan / step <= MAX_LABELS) || TICK_STEPS[TICK_STEPS.length - 1];
    const tickCount = Math.ceil(monthSpan / tickStepMonths) + 1;
    const MIN_TICK_SPACING = 78;

    const width = Math.max(
      1100,
      cases.length * 46 + leftPad + rightPad,
      tickCount * MIN_TICK_SPACING + leftPad + rightPad
    );
    const height = topPad + categories.length * laneHeight + bottomAxis;

    const scaleX = (t) => leftPad + ((t - minDate) / (maxDate - minDate)) * (width - leftPad - rightPad);
    const laneY = (catId) => topPad + laneOf[catId] * laneHeight + laneHeight / 2;

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      height: height,
      role: "img",
      "aria-label": "Timeline of tracked litigation matters"
    });

    const laneGroup = el("g", { class: "timeline-lanes" });
    const laneLines = [];
    categories.forEach((cat, laneIdx) => {
      const y = laneY(cat.id);
      const lineLength = width - rightPad - (leftPad - 18);
      const line = el("line", {
        x1: leftPad - 18, y1: y, x2: width - rightPad, y2: y,
        stroke: "var(--border)", "stroke-width": 1,
        "stroke-dasharray": lineLength, "stroke-dashoffset": lineLength
      });
      line.style.transition = `stroke-dashoffset 0.9s var(--ease) ${laneIdx * 70}ms`;
      laneGroup.appendChild(line);
      laneLines.push(line);

      const dot = el("circle", { cx: 10, cy: y, r: 4, fill: cat.color });
      const label = el("text", {
        x: 22, y: y + 4, fill: "var(--text-secondary)", "font-size": 12.5, "font-family": "var(--font-mono)"
      });
      label.textContent = cat.label;
      laneGroup.appendChild(dot);
      laneGroup.appendChild(label);
    });
    svg.appendChild(laneGroup);

    /* Month axis — advances by the adaptive tick step computed above, not
       unconditionally by 1 month, so long date ranges get fewer, readable
       labels (e.g. "Jan '25", "Jul '25", "Jan '26") instead of one for
       every single month. */
    const axisY = topPad + categories.length * laneHeight + 20;
    const axisGroup = el("g", { class: "timeline-axis" });
    const cursor = new Date(minDate);
    cursor.setDate(1);
    while (cursor.getTime() < maxDate) {
      const x = scaleX(cursor.getTime());
      if (x >= leftPad && x <= width - rightPad) {
        axisGroup.appendChild(el("line", { x1: x, y1: topPad - 10, x2: x, y2: axisY - 14, stroke: "var(--border-soft)", "stroke-width": 1, "stroke-dasharray": "2 4" }));
        const t = el("text", { x, y: axisY, fill: "var(--text-muted)", "font-size": 11.5, "font-family": "var(--font-mono)", "text-anchor": "middle" });
        t.textContent = tickStepMonths >= 12
          ? cursor.toLocaleDateString("en-US", { year: "numeric" })
          : cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        axisGroup.appendChild(t);
      }
      cursor.setMonth(cursor.getMonth() + tickStepMonths);
    }
    svg.appendChild(axisGroup);

    /* Nodes */
    const nodesGroup = el("g", { class: "timeline-nodes" });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
    const statusMap = Object.fromEntries(RELAW_DATA.statuses.map((s) => [s.id, s]));

    const sorted = [...cases].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach((c, i) => {
      const cat = catMap[c.category];
      const status = statusMap[c.status];
      const x = scaleX(new Date(c.date + "T00:00:00").getTime());
      const y = laneY(c.category);

      const g = el("g", { class: "timeline-node", "data-case-id": c.id, tabindex: "0" });

      const ring = el("circle", { class: "ring", cx: x, cy: y, r: 10, fill: "none", stroke: status.color, "stroke-width": 1.6, opacity: 0.85 });
      const core = el("circle", { class: "core", cx: x, cy: y, r: 5.5, fill: cat.color, stroke: "var(--bg-elevated)", "stroke-width": 2 });

      const labelBg = el("rect", { x: x - 90, y: y - 34, width: 180, height: 20, rx: 5, fill: "var(--bg-elevated)", stroke: "var(--border)", "stroke-width": 1, class: "node-label-bg", opacity: 0 });
      const label = el("text", { class: "node-label", x, y: y - 20, fill: "var(--text-primary)", "font-size": 11, "text-anchor": "middle", opacity: 0 });
      label.textContent = c.title.length > 34 ? c.title.slice(0, 32) + "…" : c.title;

      const titleEl = el("title", {});
      titleEl.textContent = `${c.title} — ${new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

      g.appendChild(ring);
      g.appendChild(core);
      g.appendChild(labelBg);
      g.appendChild(label);
      g.appendChild(titleEl);

      g.style.opacity = "0";
      g.style.transform = "scale(0.4)";
      g.style.transformBox = "fill-box";
      g.style.transformOrigin = "center";
      g.style.transition = `opacity 0.5s var(--ease) ${Math.min(i * 18, 900)}ms, transform 0.5s var(--ease) ${Math.min(i * 18, 900)}ms`;

      g.addEventListener("mouseenter", () => { labelBg.setAttribute("opacity", "1"); label.setAttribute("opacity", "1"); });
      g.addEventListener("mouseleave", () => { labelBg.setAttribute("opacity", "0"); label.setAttribute("opacity", "0"); });
      g.addEventListener("focus", () => { labelBg.setAttribute("opacity", "1"); label.setAttribute("opacity", "1"); });
      g.addEventListener("blur", () => { labelBg.setAttribute("opacity", "0"); label.setAttribute("opacity", "0"); });

      nodesGroup.appendChild(g);
    });
    svg.appendChild(nodesGroup);

    host.appendChild(svg);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        laneLines.forEach((line) => { line.style.strokeDashoffset = "0"; });
        nodesGroup.querySelectorAll(".timeline-node").forEach((n) => {
          n.style.opacity = "1";
          n.style.transform = "scale(1)";
        });
      });
    });
  }

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.renderTimeline = renderTimeline;
})();
