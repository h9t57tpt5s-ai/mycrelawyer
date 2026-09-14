/* =========================================================
   CREdocket — account.html "Your Plan" card. Shows the signed-in
   user's current plan (Free/Practitioner/Firm) and usage against it,
   with a link to pricing.html to upgrade. Read-only -- all writes
   (subscribing, canceling) happen in Stripe's own checkout/customer
   portal, not on this page.
   ========================================================= */

(function () {
  "use strict";
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  // FREE_MODE (2026-09-14): must match the flag in js/case-valuation.js /
  // js/lease-clause-redline.js and their Edge Functions -- pricing is
  // paused while the product gets built out further, so this card
  // shouldn't push an "Upgrade" pitch or a credit count that no longer
  // means anything. Flip back to false, together with the other three,
  // when pricing returns.
  const FREE_MODE = true;

  const nameEl = document.getElementById("account-plan-name");
  const detailEl = document.getElementById("account-plan-detail");
  if (!nameEl || !detailEl) return; // not on account.html

  const PLAN_LABELS = { practitioner: "Practitioner", firm: "Firm" };

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  async function render() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session || !session.user) return; // #account-signed-in is hidden anyway
    const userId = session.user.id;

    if (FREE_MODE) {
      nameEl.textContent = "Free";
      const { count: viewsThisMonth } = await sb
        .from("case_views")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("viewed_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
      detailEl.innerHTML = `The Case Value Calculator and Lease Clause Redline Checker are free for everyone right now while we build out the product — no credits needed. ${viewsThisMonth || 0} of 3 full write-ups viewed this month.`;
      return;
    }

    const { data: sub, error: subErr } = await sb
      .from("case_valuation_subscriptions")
      .select("plan_type, monthly_credit_allotment, current_period_start, current_period_end, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .maybeSingle();

    if (subErr) {
      detailEl.textContent = "Couldn't load your plan — try refreshing.";
      return;
    }

    if (sub) {
      nameEl.textContent = PLAN_LABELS[sub.plan_type] || sub.plan_type;
      const { count: usedThisPeriod } = await sb
        .from("case_valuation_analyses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("credit_source", "subscription")
        .gte("created_at", sub.current_period_start);
      const used = usedThisPeriod || 0;
      detailEl.innerHTML = `<strong>${used} of ${sub.monthly_credit_allotment}</strong> AI analysis credits used this period · unlimited full write-ups · renews ${fmtDate(sub.current_period_end)}. Need more before then? <a href="case-valuation.html" class="text-accent" style="display:inline;">Buy a top-up pack</a>.`;
      return;
    }

    // No active subscription -- Free tier. Show the one-time credit
    // balance (if any) since that's the only paid thing a Free user
    // might already have, plus the free-read count for this month.
    nameEl.textContent = "Free";
    const [{ data: purchases }, { count: oneTimeUsed }, { count: viewsThisMonth }] = await Promise.all([
      sb.from("case_valuation_purchases").select("credits_granted"),
      sb.from("case_valuation_analyses").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("credit_source", "one_time"),
      sb.from("case_views").select("id", { count: "exact", head: true }).eq("user_id", userId)
        .gte("viewed_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);
    const totalOneTime = (purchases || []).reduce((s, p) => s + (p.credits_granted || 0), 0);
    const remainingOneTime = totalOneTime - (oneTimeUsed || 0);
    const creditsLine = totalOneTime > 0
      ? `${remainingOneTime} of ${totalOneTime} purchased AI credits remaining (never expire).`
      : `No AI analysis credits yet.`;
    detailEl.innerHTML = `${creditsLine} ${viewsThisMonth || 0} of 3 full write-ups viewed this month. <a href="pricing.html" class="text-accent" style="display:inline;">Upgrade for unlimited reads + monthly AI credits</a>.`;
  }

  sb.auth.getSession().then(render);
  sb.auth.onAuthStateChange(render);
})();
