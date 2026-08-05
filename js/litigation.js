/* =========================================================
   MyCRELawyer — Litigation index page: filter, search, sort, render
   ========================================================= */

(function () {
  "use strict";
  if (typeof RELAW_DATA === "undefined") return;

  const state = {
    query: "",
    categories: new Set(),
    status: "all",
    stateFilter: "all",
    sort: "newest"
  };

  const grid = document.getElementById("case-grid");
  const timelineHost = document.getElementById("timeline-host");
  const resultsCount = document.getElementById("results-count");
  const searchInput = document.getElementById("search-input");
  const statusSelect = document.getElementById("status-select");
  const stateSelect = document.getElementById("state-select");
  const sortSelect = document.getElementById("sort-select");
  const chipRow = document.getElementById("category-chips");
  const clearBtn = document.getElementById("clear-filters");
  const statePillList = document.getElementById("state-pills");

  if (!grid) return;

  /* Build category chips */
  RELAW_DATA.categories.forEach((cat) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.style.color = "var(--text-secondary)";
    chip.innerHTML = `<span class="dot" style="background:${cat.color}"></span>${cat.label}`;
    chip.addEventListener("click", () => {
      if (state.categories.has(cat.id)) {
        state.categories.delete(cat.id);
        chip.classList.remove("active");
        chip.style.color = "var(--text-secondary)";
      } else {
        state.categories.add(cat.id);
        chip.classList.add("active");
        chip.style.color = cat.color;
      }
      render();
    });
    chipRow.appendChild(chip);
  });

  /* Build status options */
  RELAW_DATA.statuses.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    statusSelect.appendChild(opt);
  });

  /* Build state (jurisdiction) options, only for states actually represented */
  const stateCounts = {};
  RELAW_DATA.cases.forEach((c) => {
    if (!c.state) return;
    stateCounts[c.state] = (stateCounts[c.state] || 0) + 1;
  });
  const representedStates = Object.keys(stateCounts).sort((a, b) =>
    RELAW_DATA.states[a].localeCompare(RELAW_DATA.states[b])
  );
  if (stateSelect) {
    representedStates.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${RELAW_DATA.states[code]} (${stateCounts[code]})`;
      stateSelect.appendChild(opt);
    });
  }

  function getFiltered() {
    let list = RELAW_DATA.cases.filter((c) => {
      if (state.categories.size && !state.categories.has(c.category)) return false;
      if (state.status !== "all" && c.status !== state.status) return false;
      if (state.stateFilter !== "all" && c.state !== state.stateFilter) return false;
      if (state.query) {
        const q = state.query.toLowerCase();
        const stateName = c.state ? RELAW_DATA.states[c.state] || "" : "";
        const hay = (c.title + " " + c.summary + " " + c.tags.join(" ") + " " + c.jurisdiction + " " + stateName).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => (state.sort === "newest" ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date)));
    return list;
  }

  function render() {
    const filtered = getFiltered();
    resultsCount.textContent = `${filtered.length} matter${filtered.length === 1 ? "" : "s"}`;

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <svg viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <p>No matters match these filters. Try widening your search.</p>
        </div>`;
    } else {
      grid.innerHTML = filtered.map((c) => window.RELAW_UTILS.caseCardHtml(c)).join("");
      grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
    }

    if (timelineHost) window.RELAW_UTILS.renderTimeline("timeline-host", filtered);

    if (statePillList) {
      statePillList.querySelectorAll(".state-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.getAttribute("data-state") === state.stateFilter);
      });
    }
  }

  function selectState(code, opts) {
    state.stateFilter = code;
    if (stateSelect) stateSelect.value = code;
    render();
    if (!opts || opts.scroll !== false) {
      const target = document.getElementById("filters-anchor") || grid;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  window.RELAW_UTILS = window.RELAW_UTILS || {};
  window.RELAW_UTILS.selectState = selectState;

  /* Jurisdiction map + browse-by-state pill list */
  if (window.RELAW_UTILS.renderUsMap) {
    window.RELAW_UTILS.renderUsMap("usmap-host", (code) => selectState(code));
  }
  if (statePillList) {
    statePillList.innerHTML = representedStates
      .map(
        (code) =>
          `<button type="button" class="state-pill" data-state="${code}">${RELAW_DATA.states[code]} <span class="count">${stateCounts[code]}</span></button>`
      )
      .join("");
    statePillList.querySelectorAll(".state-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const code = pill.getAttribute("data-state");
        selectState(state.stateFilter === code ? "all" : code, { scroll: false });
      });
    });
  }

  let debounceTimer;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = e.target.value.trim();
      render();
    }, 160);
  });
  statusSelect.addEventListener("change", (e) => { state.status = e.target.value; render(); });
  if (stateSelect) stateSelect.addEventListener("change", (e) => { state.stateFilter = e.target.value; render(); });
  sortSelect.addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  clearBtn.addEventListener("click", () => {
    state.query = ""; state.status = "all"; state.stateFilter = "all"; state.sort = "newest"; state.categories.clear();
    searchInput.value = ""; statusSelect.value = "all"; sortSelect.value = "newest";
    if (stateSelect) stateSelect.value = "all";
    chipRow.querySelectorAll(".chip").forEach((c) => { c.classList.remove("active"); c.style.color = "var(--text-secondary)"; });
    render();
  });

  /* Deep-link support: ?category=zoning-land-use and/or ?state=NY */
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get("category");
  if (catParam && RELAW_DATA.categories.some((c) => c.id === catParam)) {
    state.categories.add(catParam);
    const idx = RELAW_DATA.categories.findIndex((c) => c.id === catParam);
    const chip = chipRow.children[idx];
    chip.classList.add("active");
    chip.style.color = RELAW_DATA.categories[idx].color;
  }
  const stateParam = params.get("state");
  if (stateParam && RELAW_DATA.states[stateParam]) {
    state.stateFilter = stateParam;
    if (stateSelect) stateSelect.value = stateParam;
  }

  render();
})();
