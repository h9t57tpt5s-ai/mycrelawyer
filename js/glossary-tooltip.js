/* =========================================================
   CREdocket — In-article glossary term tooltips
   Replaces the old standalone glossary page: instead of sending
   readers to a separate reference page, defined terms are marked
   inline in article prose (case write-ups, the quarterly report
   narrative, the eviction handbook) and show their definition in a
   small popover on hover/focus (tap on touch devices).

   Usage: window.RELAW_UTILS.linkifyGlossaryTerms(containerEl) --
   call once after any article-like HTML has been inserted into the
   DOM. Wraps at most one occurrence of each glossary term per call
   (per container) so a paragraph that says "CMBS" five times isn't
   littered with five identical dotted-underlines.
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined" || !RELAW_DATA.glossary || !RELAW_DATA.glossary.length) return;

  // A handful of terms are written in the data as "Primary (Alias)" or
  // "A / B" for readability on the term itself, but articles are far more
  // likely to use the short/alternate form in running prose. Give those a
  // couple of extra literal match phrases; everything else falls back to
  // the term text itself (with a trailing " (...)" qualifier stripped).
  const ALIASES = {
    "cercla": ["CERCLA", "Superfund"],
    "cmbs": ["CMBS"],
    "chapter-11-reorganization": ["Chapter 11 Reorganization", "Chapter 11"],
    "article-78-proceeding": ["Article 78 Proceeding", "Article 78"],
    "declaratory-judgment-action": ["Declaratory Judgment Action", "Declaratory Judgment"],
    "eminent-domain": ["Eminent Domain", "Condemnation"],
    "guarantor-liability": ["Guarantor Liability", "Recourse Carve-Out"],
    "non-performing-matured-balloon-loan": ["Non-Performing Matured Balloon Loan", "Matured Balloon Loan", "Non-Performing Loan"],
    "phase-i-ii-environmental-assessment": ["Phase I Environmental Site Assessment", "Phase II Environmental Site Assessment", "Phase I Environmental Assessment", "Phase II Environmental Assessment"],
    "ucc-foreclosure": ["UCC Foreclosure", "UCC Article 9"]
  };

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Build one { re, id, term } entry per glossary item, where `re` matches
  // ANY of that item's phrases. Sort the master list longest-phrase-first
  // so e.g. "Phase I Environmental Site Assessment" claims its full span
  // before a shorter, more generic alias could.
  const entries = RELAW_DATA.glossary
    .map((g) => {
      const phrases = ALIASES[g.id] || [g.term.replace(/\s*\([^)]*\)\s*$/, "").trim()];
      return { id: g.id, term: g.term, definition: g.definition, phrases };
    })
    .sort((a, b) => Math.max(...b.phrases.map((p) => p.length)) - Math.max(...a.phrases.map((p) => p.length)));

  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

  // One master regex alternation, longest phrase first within it too.
  const allPhrases = entries
    .flatMap((e) => e.phrases.map((p) => ({ p, id: e.id })))
    .sort((a, b) => b.p.length - a.p.length);
  const masterRe = new RegExp("\\b(" + allPhrases.map((x) => escapeRe(x.p)).join("|") + ")\\b", "i");
  const phraseToId = new Map(allPhrases.map((x) => [x.p.toLowerCase(), x.id]));

  function idForMatch(matchedText) {
    const lower = matchedText.toLowerCase();
    if (phraseToId.has(lower)) return phraseToId.get(lower);
    // Fallback: case-insensitive scan (matchedText should already be an
    // exact phrase from the regex, but belt-and-suspenders).
    for (const [p, id] of phraseToId) if (p === lower) return id;
    return null;
  }

  function linkify(container) {
    if (!container) return;
    const used = new Set();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("a, button, script, style, .glossary-term, .glossary-tooltip-bubble, [data-case-id]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodesToProcess = [];
    let n;
    while ((n = walker.nextNode())) nodesToProcess.push(n);

    nodesToProcess.forEach((textNode) => {
      const text = textNode.nodeValue;
      const frag = document.createDocumentFragment();
      let rest = text;
      let matchedSomething = false;

      while (true) {
        const m = rest.match(masterRe);
        if (!m) break;
        const id = idForMatch(m[1]);
        if (!id || used.has(id)) {
          // Already used this term elsewhere in the container (or no id
          // resolved) -- keep the plain text and stop scanning this phrase
          // occurrence, but keep looking further in the string for a
          // *different* term.
          const idx = m.index + m[0].length;
          frag.appendChild(document.createTextNode(rest.slice(0, idx)));
          rest = rest.slice(idx);
          continue;
        }
        used.add(id);
        matchedSomething = true;
        const entry = byId[id];
        frag.appendChild(document.createTextNode(rest.slice(0, m.index)));
        const span = document.createElement("span");
        span.className = "glossary-term";
        span.tabIndex = 0;
        span.setAttribute("data-glossary-id", id);
        span.setAttribute("role", "button");
        span.setAttribute("aria-label", `${m[1]} — glossary term, ${entry.definition}`);
        span.textContent = m[1];
        frag.appendChild(span);
        rest = rest.slice(m.index + m[0].length);
      }

      if (matchedSomething) {
        frag.appendChild(document.createTextNode(rest));
        textNode.parentNode.replaceChild(frag, textNode);
      }
    });
  }

  // ---------- Shared tooltip bubble ----------
  let bubble = null;
  let activeSpan = null;
  let hideTimer = null;

  function buildBubble() {
    bubble = document.createElement("div");
    bubble.className = "glossary-tooltip-bubble";
    bubble.innerHTML = `<button type="button" class="close-btn" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><div class="term"></div><div class="definition"></div>`;
    document.body.appendChild(bubble);
    bubble.querySelector(".close-btn").addEventListener("click", hideBubble);
    bubble.addEventListener("mouseenter", () => { if (hideTimer) clearTimeout(hideTimer); });
    bubble.addEventListener("mouseleave", scheduleHide);
  }

  function showBubble(span) {
    if (!bubble) buildBubble();
    if (hideTimer) clearTimeout(hideTimer);
    const id = span.getAttribute("data-glossary-id");
    const entry = byId[id];
    if (!entry) return;
    activeSpan = span;
    document.querySelectorAll(".glossary-term.is-active").forEach((s) => s.classList.remove("is-active"));
    span.classList.add("is-active");
    bubble.querySelector(".term").textContent = entry.term;
    bubble.querySelector(".definition").textContent = entry.definition;
    bubble.classList.add("open");

    // Position: prefer below the term, flip above if it would overflow the
    // viewport bottom; clamp horizontally within a 16px margin.
    const rect = span.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    let top = rect.bottom + 8;
    if (top + bubbleRect.height > window.innerHeight - 12) top = rect.top - bubbleRect.height - 8;
    let left = rect.left;
    left = Math.max(16, Math.min(left, window.innerWidth - bubbleRect.width - 16));
    bubble.style.top = Math.max(12, top) + "px";
    bubble.style.left = left + "px";
  }

  function hideBubble() {
    if (!bubble) return;
    bubble.classList.remove("open");
    if (activeSpan) activeSpan.classList.remove("is-active");
    activeSpan = null;
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, 120);
  }

  document.addEventListener("mouseover", (e) => {
    const span = e.target.closest && e.target.closest(".glossary-term");
    if (span) showBubble(span);
  });
  document.addEventListener("mouseout", (e) => {
    const span = e.target.closest && e.target.closest(".glossary-term");
    if (span && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".glossary-term, .glossary-tooltip-bubble"))) {
      scheduleHide();
    }
  });
  document.addEventListener("focusin", (e) => {
    const span = e.target.closest && e.target.closest(".glossary-term");
    if (span) showBubble(span);
  });
  document.addEventListener("focusout", (e) => {
    const span = e.target.closest && e.target.closest(".glossary-term");
    if (span) scheduleHide();
  });
  // Touch devices: tapping a term toggles the bubble; tapping outside closes it.
  document.addEventListener("click", (e) => {
    const span = e.target.closest && e.target.closest(".glossary-term");
    if (span) {
      e.preventDefault();
      if (activeSpan === span && bubble && bubble.classList.contains("open")) {
        hideBubble();
      } else {
        showBubble(span);
      }
      return;
    }
    if (!(e.target.closest && e.target.closest(".glossary-tooltip-bubble"))) hideBubble();
  });
  window.addEventListener("scroll", hideBubble, { passive: true });

  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.linkifyGlossaryTerms = linkify;
})();
