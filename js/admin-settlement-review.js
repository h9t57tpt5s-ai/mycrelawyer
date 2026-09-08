/* =========================================================
   CREdocket — Settlement Contribution admin review page logic
   Client-side email check here is a UX nicety only (hides the UI faster
   for a non-admin) -- the REAL enforcement is server-side in the
   admin-review-contribution Edge Function, which checks the caller's
   verified auth token against ADMIN_EMAILS independently of anything
   this file does.
   ========================================================= */

(function () {
  "use strict";
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const REVIEW_FN_URL = SUPABASE_URL + "/functions/v1/admin-review-contribution";
  const ADMIN_EMAILS = ["jeffnovel@icloud.com"];

  const sb = window.RELAW_SUPABASE;
  const host = document.getElementById("adm-host");
  if (!host) return;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  async function callReviewFn(payload) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("Not signed in");
    const resp = await fetch(REVIEW_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);
    return json;
  }

  function itemHtml(item) {
    const tags = [
      ["Category", item.category], ["Property type", item.property_type], ["Jurisdiction", item.jurisdiction],
      ["Claimed", item.claimed_amount != null ? "$" + Number(item.claimed_amount).toLocaleString("en-US") : null],
      ["Settled", item.settled_amount != null ? "$" + Number(item.settled_amount).toLocaleString("en-US") : null],
      ["Filed", item.filed_date], ["Resolved", item.resolved_date],
      ["Insurance", item.insurance_contribution], ["Court/Docket", item.court_or_docket],
    ].filter(([, v]) => v);
    const flagBanner = item.confidentiality_flag_detected
      ? `<div class="adm-flag-banner"><strong>Confidentiality scan hit:</strong> ${esc(item.confidentiality_flag_reason || "")}</div>`
      : "";
    return `
      <div class="adm-item" data-id="${item.id}">
        <div class="adm-item-top">
          <div>
            <strong>${esc(item.case_caption || "(no caption extracted)")}</strong>
            <span class="text-muted" style="font-size:11.5px; margin-left:8px;">submitted ${new Date(item.created_at).toLocaleString("en-US")} — user ${esc(item.user_id)}</span>
          </div>
          <span class="badge">${esc(item.status)}</span>
        </div>
        ${flagBanner}
        <div class="adm-tag-row">${tags.map(([k, v]) => `<span class="detail-tag">${esc(k)}: ${esc(v)}</span>`).join("")}</div>
        ${item.key_factual_drivers ? `<p class="text-secondary" style="font-size:13px; margin-bottom:10px;">${esc(item.key_factual_drivers)}</p>` : ""}
        <div class="adm-doc-label">Petition / Complaint (extracted text)</div>
        <div class="adm-doc">${esc(item.petition_text)}</div>
        <div class="adm-doc-label">Settlement / Order (extracted text)</div>
        <div class="adm-doc">${esc(item.settlement_text)}</div>
        <div class="adm-actions">
          <label style="font-size:12px; display:flex; align-items:center; gap:6px;">Credits:
            <input type="number" class="adm-credits-input" value="3" min="0" style="width:56px; padding:4px 6px;" />
          </label>
          <button type="button" class="btn btn-primary btn-sm adm-approve-btn">Approve &amp; Grant Credits</button>
          <button type="button" class="btn btn-ghost btn-sm adm-reject-btn">Reject</button>
          <span class="adm-item-status text-muted" style="font-size:12px;"></span>
        </div>
      </div>`;
  }

  async function loadQueue() {
    host.innerHTML = `<div class="gate-card is-loading">Loading pending submissions…</div>`;
    try {
      const json = await callReviewFn({ action: "list_pending" });
      const items = json.items || [];
      if (!items.length) {
        host.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Nothing pending — queue is clear.</p></div>`;
        return;
      }
      host.innerHTML = items.map(itemHtml).join("");
      host.querySelectorAll(".adm-item").forEach((el) => {
        const id = parseInt(el.getAttribute("data-id"), 10);
        const statusEl = el.querySelector(".adm-item-status");
        el.querySelector(".adm-approve-btn").addEventListener("click", async (e) => {
          e.target.disabled = true;
          const credits = parseInt(el.querySelector(".adm-credits-input").value, 10) || 0;
          try {
            const res = await callReviewFn({ action: "approve", id, creditsToGrant: credits });
            statusEl.textContent = `Approved — ${res.creditsGranted} credits granted.`;
            el.style.opacity = "0.5";
          } catch (err) {
            statusEl.textContent = "Error: " + err.message;
            e.target.disabled = false;
          }
        });
        el.querySelector(".adm-reject-btn").addEventListener("click", async (e) => {
          const reason = prompt("Rejection reason (shown internally only):") || "Did not meet contribution requirements.";
          e.target.disabled = true;
          try {
            await callReviewFn({ action: "reject", id, reason });
            statusEl.textContent = "Rejected.";
            el.style.opacity = "0.5";
          } catch (err) {
            statusEl.textContent = "Error: " + err.message;
            e.target.disabled = false;
          }
        });
      });
    } catch (err) {
      host.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${esc(err.message)}</p></div>`;
    }
  }

  function signInHtml() {
    return `
      <div class="gate-card">
        <h3 style="margin-bottom:8px;">Sign in required</h3>
        <button type="button" class="btn btn-primary btn-sm" id="adm-signin-btn">Sign in</button>
      </div>`;
  }

  async function init() {
    if (!sb) { host.innerHTML = `<div class="gate-card"><p>Not available.</p></div>`; return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      host.innerHTML = signInHtml();
      const btn = document.getElementById("adm-signin-btn");
      if (btn && window.RELAW_AUTH) btn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
      return;
    }
    const email = (session.user.email || "").toLowerCase();
    if (!ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      host.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">This page isn't available for your account.</p></div>`;
      return;
    }
    loadQueue();
  }

  init();
  if (sb) sb.auth.onAuthStateChange(() => init());
})();
