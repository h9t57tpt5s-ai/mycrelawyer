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

   2026-09-16: replaced the original "one name per line, one type for
   the whole batch" bulk-add box with a real CSV bulk import (name, type,
   note per row; upload a .csv or paste it directly) with per-row
   validation feedback -- a second, closely-related finding from the same
   100-persona review ("no CSV bulk import ... capped at 50, manual
   one-by-one entry"). Also raised MAX_ENTITIES 50 -> 500 (see the
   comment at its definition) and added a matching server-side cap
   trigger (supabase/migrations/20260916_portfolio_entities_cap_trigger.sql,
   NOT auto-applied -- Jeff has to run it in the Supabase SQL Editor)
   since a client-side-only cap is trivially bypassed by anyone calling
   the Supabase REST API directly with their own session token.

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
  const bulkResultsEl = document.getElementById("portfolio-bulk-results");

  // Raised from 50 -> 500 (2026-09-16, product-review finding: 50 was
  // unworkable for a real portfolio and forced manual one-by-one entry).
  // 500 comfortably covers even a large individual/family-office
  // portfolio (dozens of properties, each with several
  // tenants/lenders/guarantors) while staying bounded enough that this
  // shared table -- scanned in full, for every user, on every new
  // tracked matter, by check-and-send-watchlist-alerts -- can't be
  // blown up into an unbounded free-storage/spam vector by one account.
  // Enforced here client-side (checked before insert, same as before)
  // AND, as of 2026-09-16, in the database itself via a BEFORE INSERT
  // trigger -- see supabase/migrations/20260916_portfolio_entities_cap_trigger.sql.
  // The client-side check alone was never a real security boundary (any
  // signed-in user can call the Supabase REST API directly with their
  // own anon key + session token, bypassing this file entirely), so the
  // DB-side trigger is the actual enforcement; this constant just keeps
  // the UI's own messaging in sync with it and avoids relying on a round
  // trip to the database to reject something a bulk import is about to
  // do anyway. If Jeff changes the number, keep both places in sync.
  const MAX_ENTITIES = 500;

  const TYPE_LABELS = {
    property: "Property", tenant: "Tenant", lender: "Lender",
    guarantor: "Guarantor", counterparty: "Counterparty", other: "Other",
  };

  // Accepted spellings for each type in an imported CSV -- deliberately
  // generous (plural forms, the exact dropdown label text) since this is
  // free-text a user typed or exported from somewhere else, not a
  // controlled input. Anything not recognized here falls back to the
  // chosen default type rather than rejecting the row outright -- a
  // typo'd type shouldn't be treated the same as a missing name.
  const TYPE_ALIASES = {
    property: "property", properties: "property",
    tenant: "tenant", tenants: "tenant",
    lender: "lender", lenders: "lender",
    guarantor: "guarantor", guarantors: "guarantor",
    counterparty: "counterparty", counterparties: "counterparty",
    "other counterparty": "counterparty", "other counterparties": "counterparty",
    other: "other",
  };

  async function currentCount() {
    const { count } = await sb.from("portfolio_entities").select("id", { count: "exact", head: true });
    return count || 0;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Case/whitespace/punctuation-insensitive key used ONLY for duplicate
  // detection on import (both against what's already saved and against
  // other rows in the same file) -- exact-equality, not the fuzzy
  // substring match check-and-send-watchlist-alerts uses for actual case
  // matching, since a substring match here would wrongly flag distinct
  // entities (e.g. a saved "Bank" would "duplicate" every row containing
  // the word "Bank") rather than real repeats.
  function dedupeKey(name) {
    return (name || "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  }

  // Minimal RFC4180-style CSV row parser: comma-separated, double-quote
  // field wrapping, "" as an escaped quote inside a quoted field. Does
  // NOT support a quoted field spanning multiple lines -- a real edge
  // case for a multi-line address, but not one worth the complexity for
  // single-line entity names/notes, and the textarea/file this feeds
  // from is split into rows on newlines before this ever runs.
  function parseCsvRow(line) {
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  }

  function parseCsvText(text) {
    return String(text || "")
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseCsvRow);
  }

  function normalizeType(raw, fallbackType) {
    const t = (raw || "").trim().toLowerCase();
    if (!t) return { type: fallbackType, guessed: false };
    const known = TYPE_ALIASES[t];
    if (known) return { type: known, guessed: false };
    return { type: fallbackType, guessed: true };
  }

  function renderList() {
    return sb
      .from("portfolio_entities")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data: entities, error }) => {
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

  // ---------- CSV bulk import ----------
  const bulkTextarea = document.getElementById("pe-bulk-names");
  const bulkDefaultType = document.getElementById("pe-bulk-default-type");
  const dropzone = document.getElementById("pe-bulk-dropzone");
  const fileInput = document.getElementById("pe-bulk-file");
  const browseBtn = document.getElementById("pe-bulk-browse-btn");
  const templateBtn = document.getElementById("pe-bulk-template-btn");

  function loadFileIntoTextarea(file) {
    if (!bulkTextarea) return;
    const reader = new FileReader();
    reader.onload = () => {
      bulkTextarea.value = String(reader.result || "");
      bulkStatus.textContent = `Loaded ${file.name} — review below, then click Import rows.`;
      bulkStatus.className = "auth-modal-status";
    };
    reader.onerror = () => {
      bulkStatus.textContent = `Couldn't read ${file.name} — try pasting its contents into the box instead.`;
      bulkStatus.className = "auth-modal-status is-error";
    };
    reader.readAsText(file);
  }

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) loadFileIntoTextarea(f);
    });
  }
  if (dropzone) {
    ["dragenter", "dragover"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFileIntoTextarea(f);
    });
  }
  if (templateBtn) {
    templateBtn.addEventListener("click", () => {
      const sample = "name,type,note\n" +
        "400 Market Street Owner LLC,property,Primary asset\n" +
        "Acme Retail Tenant Corp,tenant,\n" +
        '"First Regional Bank, N.A.",lender,Loan on the Riverside property\n';
      window.RELAW_UTILS.downloadTextFile(sample, "credocket-portfolio-import-template.csv", "text/csv");
    });
  }

  function renderBulkResults(results) {
    if (!results.length) return "";
    const rows = results.map((r) => {
      const cls = r.status === "ok" ? "is-ok" : r.status === "error" ? "is-error" : "is-skip";
      const statusLabel = r.status === "ok" ? "Added" : r.status === "error" ? "Error" : "Skipped";
      return `<div class="import-row ${cls}">
        <span class="import-row-name">${escapeHtml(r.name)}</span>
        <span class="import-row-status">${statusLabel}</span>
        ${r.reason ? `<span class="import-row-reason" title="${escapeHtml(r.reason)}">${escapeHtml(r.reason)}</span>` : ""}
      </div>`;
    }).join("");
    return `<div class="import-results">${rows}</div>`;
  }

  bulkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) return;

    const rows = parseCsvText(bulkTextarea.value);
    // Drop an optional header row (e.g. "name,type,note") -- lets a file
    // exported with headers, or one built from the downloadable template,
    // get pasted/uploaded as-is without the user having to strip it first.
    if (rows.length && /^(name|entity|entity[\s_]?name)$/i.test(rows[0][0] || "")) rows.shift();

    if (!rows.length) {
      bulkStatus.textContent = "Paste some rows, or drop a CSV file, first.";
      bulkStatus.className = "auth-modal-status is-error";
      bulkResultsEl.innerHTML = "";
      return;
    }

    bulkStatus.textContent = "Validating…";
    bulkStatus.className = "auth-modal-status";
    bulkResultsEl.innerHTML = "";

    const { data: existingRows, error: existingErr } = await sb.from("portfolio_entities").select("entity_name");
    if (existingErr) {
      bulkStatus.textContent = existingErr.message || "Couldn't check your existing portfolio — try again.";
      bulkStatus.className = "auth-modal-status is-error";
      return;
    }
    const existingKeys = new Set((existingRows || []).map((r) => dedupeKey(r.entity_name)));
    let room = Math.max(0, MAX_ENTITIES - (existingRows || []).length);

    const defaultType = (bulkDefaultType && bulkDefaultType.value) || "counterparty";
    const seenInFile = new Set();
    const results = [];

    for (const cells of rows) {
      const name = (cells[0] || "").trim();
      if (!name) {
        results.push({ name: "(blank row)", status: "skip", reason: "missing name" });
        continue;
      }
      const key = dedupeKey(name);
      if (seenInFile.has(key)) {
        results.push({ name, status: "skip", reason: "duplicate row in this file" });
        continue;
      }
      if (existingKeys.has(key)) {
        results.push({ name, status: "skip", reason: "already in your portfolio" });
        continue;
      }
      if (room <= 0) {
        results.push({ name, status: "skip", reason: `over the ${MAX_ENTITIES}-entry limit` });
        continue;
      }
      const { type, guessed } = normalizeType(cells[1], defaultType);
      const note = (cells[2] || "").trim() || null;
      seenInFile.add(key);
      room--;
      results.push({
        name, type, note, status: "ok",
        reason: guessed ? `type "${(cells[1] || "").trim()}" not recognized — imported as ${TYPE_LABELS[type]}` : null,
      });
    }

    const toInsert = results.filter((r) => r.status === "ok");
    // Chunked rather than one giant insert -- keeps any single request
    // body reasonable for a very large paste/file and means a failure on
    // one chunk (e.g. a transient network error) doesn't have to be
    // reported as "the whole import failed" when most of it went through.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      const { error } = await sb.from("portfolio_entities").insert(
        chunk.map((r) => ({
          user_id: session.user.id,
          entity_name: r.name,
          entity_type: r.type,
          notes: r.note,
        }))
      );
      if (error) {
        chunk.forEach((r) => { r.status = "error"; r.reason = error.message || "insert failed"; });
      }
    }

    const addedCount = results.filter((r) => r.status === "ok").length;
    const skippedCount = results.length - addedCount;
    bulkStatus.textContent = `${addedCount} added${skippedCount ? `, ${skippedCount} skipped` : ""}.`;
    bulkStatus.className = "auth-modal-status" + (addedCount === 0 && results.length ? " is-error" : "");
    bulkResultsEl.innerHTML = renderBulkResults(results);
    window.RELAW_UTILS.showToast(
      `Bulk import: ${addedCount} added${skippedCount ? `, ${skippedCount} skipped` : ""}.`,
      { error: addedCount === 0 }
    );
    if (addedCount) {
      bulkTextarea.value = "";
      renderList();
    }
  });

  function renderAccountState() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (session && session.user) renderList();
  }

  sb.auth.getSession().then(renderAccountState);
  sb.auth.onAuthStateChange(renderAccountState);
})();
