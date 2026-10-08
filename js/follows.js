/* Account page: the cases a reader follows (table docket_follows; see
   supabase/functions/docket-follows). Lists them with a Stop following
   button; following happens on each case's page. */
(function () {
  const sb = window.RELAW_SUPABASE;
  const list = document.getElementById("follows-list");
  const count = document.getElementById("follows-count");
  if (!sb || !list) return;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const safePath = (p) => (/^\/(matters|chapter-11|federal-cases)\/[A-Za-z0-9._-]+\.html$/.test(p) ? p : "/litigation.html");

  async function render(session) {
    if (!session) { list.innerHTML = ""; count.textContent = "0"; return; }
    const { data, error } = await sb.from("docket_follows").select("id, docket_id, label, page_path, created_at").order("created_at", { ascending: false });
    if (error) { list.innerHTML = `<p class="text-muted" style="font-size:13px;">Couldn't load the cases you follow.</p>`; return; }
    count.textContent = String(data.length);
    list.innerHTML = data.length ? data.map((f) => `
      <div class="card" style="padding:14px 18px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
        <div style="min-width:0;">
          <a href="${esc(safePath(f.page_path))}" style="font-weight:600;">${esc(f.label)}</a>
          <div class="text-muted" style="font-size:12px;">Following since ${esc(new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-unfollow="${esc(f.id)}">Stop following</button>
      </div>`).join("") : `<p class="text-muted" style="font-size:13px;">You don't follow any cases yet.</p>`;
  }

  list.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-unfollow]");
    if (!b) return;
    b.disabled = true;
    const { error } = await sb.from("docket_follows").delete().eq("id", Number(b.dataset.unfollow));
    if (error) { b.disabled = false; b.textContent = "Try again"; return; }
    const { data } = await sb.auth.getSession();
    render(data.session);
  });
  sb.auth.getSession().then(({ data }) => render(data.session));
  sb.auth.onAuthStateChange((_e, session) => render(session));
  document.addEventListener("relaw:follows-changed", () => sb.auth.getSession().then(({ data }) => render(data.session)));
})();
