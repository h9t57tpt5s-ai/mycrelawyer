/* =========================================================
   CREdocket — Portfolio: a signed-in user's own named properties,
   tenants, lenders, guarantors, and other counterparties, matched
   automatically against every new tracked matter (see
   supabase/functions/check-and-send-watchlist-alerts's portfolio-entity
   matching, added alongside its existing watchlist matching).

   This is the #1 finding from the 100-persona stakeholder review: every
   single stakeholder group independently named "no way to upload my own
   properties/counterparties for automatic alerting" as the single
   biggest gap and the single highest-value fix. Distinct from
   Watchlists (js/watchlists.js) above it on this page -- watchlists
   filter by state/category/keyword; this matches a user's own named
   entities against real party names (and, as a fallback, case titles)
   on every matter, regardless of category or state.

   Only runs on account.html, which has the required DOM hooks.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const listEl = document.getElementById("portfolio-list");
  const countEl = document.getElementById("portfolio-count");
  const form = document.getElementById("portfolio-form");
  const bulkForm = document.getElementById("portfolio-bulk-form");
  if (!listEl || !form || !bulkForm) return; // not on account.html

  const formStatus = document.getElementById("portfolio-form-status");
  const bulkStatus = document.getElementById("portfolio-bulk-status");

  // Generous but real -- keeps this from being usable as unbounded free
  // storage while comfortably covering even a fairly large individual
  // portfolio; institutional-scale bulk import is exactly the kind of
  // thing the review flagged as needing a real enterprise tier, not this
  // free-tier form. Enforced here (client-side, checked before insert)
  // since there is no subscription tier live to key a server-side limit
  // off of right now (see FREE_MODE elsewhere on the site).
  const MAX_ENTITIES = 50;

  const TYPE_LABELS = {
    property: "Property", tenant: "Tenant", lender: "Lender",
    guarantor: "Guarantor", counterparty: "Counterparty", other: "Other",
  };

  async function currentCount() {
    const { count } = await sb.from("portfolio_entities").select("id", { count: "exact", head: true });
    return count || 0;
  }

  async function renderList() {
    const { data: entities, error } = await sb
      .from("portfolio_entities")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      listEl.innerHTML = `<p class="text-muted">Couldn't load your portfolio — try refreshing.</p>`;
      return;
    }
    countEl.textContent = entities.length;
    if (!entities.length) {
      listEl.innerHTML = window.RELAW_UTILS.emptyStateHtml({
        message: "Nothing added yet — add a property, tenant, lender, or other counterparty above to get alerted automatically.",
        actionLabel: "Add your first entry",
        actionId: "pe-empty-cta",
      });
      const cta = document.getElementById("pe-empty-cta");
      const nameInput = document.getElementById("pe-name");
      if (cta && nameInput) cta.addEventListener("click", () => {
        nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
        nameInput.focus();
      });
      return;
    }

    listEl.innerHTML = entities.map((e) => `
      <div class="card reveal" style="margin-bottom:12px; padding:16px 20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px;">
          <div>
            <span style="font-weight:600; font-size:14px;">${e.entity_name}</span>
            <span class="text-muted mono" style="font-size:11.5px; margin-left:8px; text-transform:uppercase; letter-spacing:0.03em;">${TYPE_LABELS[e.entity_type] || e.entity_type}</span>
            ${e.notes ? `<p class="text-muted" style="font-size:12.5px; margin-top:4px;">${e.notes}</p>` : ""}
          </div>
          <button type="button" class="auth-nav-signout" data-delete-entity="${e.id}">Remove</button>
        </div>
      </div>`).join("");
    listEl.querySelectorAll(".reveal").forEach((el) => el.classList.add("in-view"));
    listEl.querySelectorAll("[data-delete-entity]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await sb.from("portfolio_entities").delete().eq("id", btn.getAttribute("data-delete-entity"));
        renderList();
      });
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) return;
    const name = document.getElementById("pe-name").value.trim();
    if (!name) return;
    formStatus.textContent = "Saving…";
    formStatus.className = "auth-modal-status";
    if ((await currentCount()) >= MAX_ENTITIES) {
      formStatus.textContent = `You've reached the ${MAX_ENTITIES}-entry limit for now.`;
      formStatus.className = "auth-modal-status is-error";
      return;
    }
    const { error } = await sb.from("portfolio_entities").insert({
      user_id: session.user.id,
      entity_name: name,
      entity_type: document.getElementById("pe-type").value,
      notes: document.getElementById("pe-notes").value.trim() || null,
    });
    if (error) {
      formStatus.textContent = error.message || "Couldn't save — try again.";
      formStatus.className = "auth-modal-status is-error";
      return;
    }
    formStatus.textContent = "";
    form.reset();
    renderList();
  });

  bulkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) return;
    const names = document.getElementById("pe-bulk-names").value
      .split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    bulkStatus.textContent = "Saving…";
    bulkStatus.className = "auth-modal-status";
    const existing = await currentCount();
    if (existing >= MAX_ENTITIES) {
      bulkStatus.textContent = `You've reached the ${MAX_ENTITIES}-entry limit for now.`;
      bulkStatus.className = "auth-modal-status is-error";
      return;
    }
    const room = MAX_ENTITIES - existing;
    const toAdd = names.slice(0, room);
    const entityType = document.getElementById("pe-bulk-type").value;
    const { error } = await sb.from("portfolio_entities").insert(
      toAdd.map((name) => ({ user_id: session.user.id, entity_name: name, entity_type: entityType }))
    );
    if (error) {
      bulkStatus.textContent = error.message || "Couldn't save — try again.";
      bulkStatus.className = "auth-modal-status is-error";
      return;
    }
    bulkStatus.textContent = names.length > toAdd.length
      ? `Added ${toAdd.length} — the rest would have gone over the ${MAX_ENTITIES}-entry limit.`
      : "";
    bulkForm.reset();
    renderList();
  });

  function renderAccountState() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (session && session.user) renderList();
  }

  sb.auth.getSession().then(renderAccountState);
  sb.auth.onAuthStateChange(renderAccountState);
})();
