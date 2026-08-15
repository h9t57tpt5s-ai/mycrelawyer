/* =========================================================
   CREdocket — Watchlists (items 12 + 14 combined)
   A signed-in user saves a filter — any combination of states,
   practice areas, and/or a free-text party/company keyword — and
   sees which tracked matters currently match it. New matches also
   feed the same-day alert email (see js/watchlist-alerts server side).
   Only runs on account.html, which has the required DOM hooks.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb || typeof RELAW_DATA === "undefined") return;

  const signedOutEl = document.getElementById("account-signed-out");
  const signedInEl = document.getElementById("account-signed-in");
  const listEl = document.getElementById("watchlists-list");
  const countEl = document.getElementById("watchlist-count");
  const form = document.getElementById("watchlist-form");
  if (!signedOutEl || !signedInEl || !form) return; // not on account.html

  const statesSelect = document.getElementById("wl-states");
  const categoriesSelect = document.getElementById("wl-categories");
  const formStatus = document.getElementById("watchlist-form-status");

  // Populate the two multi-selects from the same data the rest of the site uses.
  statesSelect.innerHTML = Object.entries(RELAW_DATA.states)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, name]) => `<option value="${code}">${name}</option>`)
    .join("");
  categoriesSelect.innerHTML = RELAW_DATA.categories
    .map((c) => `<option value="${c.id}">${c.label}</option>`)
    .join("");

  function selectedValues(selectEl) {
    return [...selectEl.selectedOptions].map((o) => o.value);
  }

  async function findMatches(watchlist) {
    let query = sb.from("case_data").select("*");
    if (watchlist.states && watchlist.states.length) query = query.in("state", watchlist.states);
    if (watchlist.categories && watchlist.categories.length) query = query.in("category", watchlist.categories);
    if (watchlist.keyword && watchlist.keyword.trim()) {
      const kw = `%${watchlist.keyword.trim()}%`;
      query = query.or(`title.ilike.${kw},summary.ilike.${kw},significance.ilike.${kw}`);
    }
    const { data, error } = await query.order("date", { ascending: false }).limit(10);
    if (error) return [];
    return data || [];
  }

  function filterSummary(w) {
    const bits = [];
    if (w.states && w.states.length) bits.push(w.states.map((s) => RELAW_DATA.states[s] || s).join(", "));
    if (w.categories && w.categories.length) {
      const catMap = Object.fromEntries(RELAW_DATA.categories.map((c) => [c.id, c.label]));
      bits.push(w.categories.map((c) => catMap[c] || c).join(", "));
    }
    if (w.keyword) bits.push(`"${w.keyword}"`);
    return bits.length ? bits.join(" · ") : "All matters";
  }

  async function renderWatchlists() {
    const { data: watchlists, error } = await sb
      .from("watchlists")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      listEl.innerHTML = `<p class="text-muted">Couldn't load your watchlists — try refreshing.</p>`;
      return;
    }
    countEl.textContent = watchlists.length;
    if (!watchlists.length) {
      listEl.innerHTML = `<p class="text-muted">No watchlists yet — create one above.</p>`;
      return;
    }

    const cards = await Promise.all(watchlists.map(async (w) => {
      const matches = await findMatches(w);
      const matchesHtml = matches.length
        ? matches.map((c) => `<span data-case-id="${c.id}" class="detail-tag" style="cursor:pointer;">${c.title.length > 50 ? c.title.slice(0, 50) + "…" : c.title} ↗</span>`).join("")
        : `<span class="text-muted" style="font-size:13px;">No matching matters yet.</span>`;
      return `<div class="card reveal" style="margin-bottom:16px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
          <div>
            <h3 style="font-size:1.05rem;">${w.name}</h3>
            <p class="text-muted mono" style="font-size:12px; margin-top:6px;">${filterSummary(w)}</p>
          </div>
          <button type="button" class="auth-nav-signout" data-delete-watchlist="${w.id}">Delete</button>
        </div>
        <div class="tag-row mt-16">${matchesHtml}</div>
      </div>`;
    }));
    listEl.innerHTML = cards.join("");
    listEl.querySelectorAll("[data-delete-watchlist]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await sb.from("watchlists").delete().eq("id", btn.getAttribute("data-delete-watchlist"));
        renderWatchlists();
      });
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = window.RELAW_AUTH.getSession();
    if (!session) return;
    formStatus.textContent = "Saving…";
    formStatus.className = "auth-modal-status";
    const { error } = await sb.from("watchlists").insert({
      user_id: session.user.id,
      name: document.getElementById("wl-name").value.trim(),
      states: selectedValues(statesSelect),
      categories: selectedValues(categoriesSelect),
      keyword: document.getElementById("wl-keyword").value.trim() || null
    });
    if (error) {
      formStatus.textContent = error.message || "Couldn't save — try again.";
      formStatus.className = "auth-modal-status is-error";
      return;
    }
    formStatus.textContent = "";
    form.reset();
    renderWatchlists();
  });

  function renderAccountState() {
    const session = window.RELAW_AUTH.getSession();
    if (session && session.user) {
      signedOutEl.style.display = "none";
      signedInEl.style.display = "block";
      renderWatchlists();
    } else {
      signedOutEl.style.display = "block";
      signedInEl.style.display = "none";
    }
  }

  document.getElementById("account-signin-btn")?.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());

  sb.auth.getSession().then(renderAccountState);
  sb.auth.onAuthStateChange(renderAccountState);
})();
