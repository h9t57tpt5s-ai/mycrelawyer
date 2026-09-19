/* CREdocket — 11 U.S.C. § 502(b)(6) landlord claim cap calculator.
   Pure math in computeLeaseRejectionCap(); DOM wiring below it. */
(function (root) {
  "use strict";

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

  // Whole months plus the day-of-month difference as a fraction of a month.
  function monthsBetween(a, b) {
    const whole = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    return whole + (b.getUTCDate() - a.getUTCDate()) / daysInMonth(b.getUTCFullYear(), b.getUTCMonth());
  }

  // Rent for the first `months` months after the start date, stepping the
  // monthly rent up by `escalation` on each 12-month anniversary.
  function rentForMonths(months, monthlyRent, escalation) {
    let total = 0;
    for (let year = 0, left = months; left > 1e-9; year++) {
      const inYear = Math.min(12, left);
      total += inYear * monthlyRent * Math.pow(1 + escalation, year);
      left -= inYear;
    }
    return total;
  }

  function computeLeaseRejectionCap(input) {
    const start = new Date(input.startDate + "T00:00:00Z");
    const end = new Date(input.leaseEndDate + "T00:00:00Z");
    const monthlyRent = Number(input.monthlyRent);
    const escalation = Number(input.annualEscalationPct || 0) / 100;
    const unpaidRent = Number(input.unpaidRent || 0);
    if (isNaN(start) || isNaN(end)) return { error: "Enter both dates." };
    if (!(end > start)) return { error: "The lease must end after the petition or surrender date." };
    if (!(monthlyRent > 0)) return { error: "Enter the monthly rent." };
    if (escalation < 0 || escalation > 0.5 || unpaidRent < 0) return { error: "Check the escalation and unpaid rent figures." };

    const remainingMonths = monthsBetween(start, end);
    const fifteenPctMonths = remainingMonths * 0.15;
    // "the greater of one year, or 15 percent, not to exceed three years, of
    // the remaining term" -- and never more rent than the lease has left.
    const capMonths = Math.min(Math.max(12, Math.min(fifteenPctMonths, 36)), remainingMonths);

    const totalRemainingRent = rentForMonths(remainingMonths, monthlyRent, escalation);
    const oneYearRent = rentForMonths(Math.min(12, remainingMonths), monthlyRent, escalation);
    const threeYearRent = rentForMonths(Math.min(36, remainingMonths), monthlyRent, escalation);

    const timeApproach = rentForMonths(capMonths, monthlyRent, escalation);
    const rentApproach = Math.min(Math.max(oneYearRent, totalRemainingRent * 0.15), threeYearRent);

    const result = {
      remainingMonths, fifteenPctMonths, capMonths, totalRemainingRent, unpaidRent,
      timeApproachFuture: timeApproach, rentApproachFuture: rentApproach,
      timeApproachCap: timeApproach + unpaidRent, rentApproachCap: rentApproach + unpaidRent,
    };
    const actual = Number(input.actualDamages);
    if (input.actualDamages !== "" && input.actualDamages != null && actual >= 0) {
      result.actualDamages = actual;
      result.allowedTime = Math.min(actual, result.timeApproachCap);
      result.allowedRent = Math.min(actual, result.rentApproachCap);
    }
    return result;
  }

  root.RELAW_LEASE_REJECTION = { computeLeaseRejectionCap: computeLeaseRejectionCap };

  if (typeof document === "undefined") return;
  const form = document.getElementById("lrc-form");
  const out = document.getElementById("lrc-result");
  if (!form || !out) return;

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const mo = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + " months";

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value;
    const r = computeLeaseRejectionCap({
      startDate: v("lrc-start"), leaseEndDate: v("lrc-end"), monthlyRent: v("lrc-rent"),
      annualEscalationPct: v("lrc-esc"), unpaidRent: v("lrc-unpaid"), actualDamages: v("lrc-actual"),
    });
    if (r.error) {
      out.innerHTML = `<p class="text-secondary">${r.error}</p>`;
      return;
    }
    const differ = Math.abs(r.timeApproachCap - r.rentApproachCap) >= 1;
    const allowedRow = r.actualDamages != null
      ? `<tr><td>Allowed claim (lesser of your actual damages and the cap)</td><td class="mono">${usd(r.allowedTime)}</td><td class="mono">${usd(r.allowedRent)}</td></tr>` : "";
    out.innerHTML = `
      <p style="font-size:14px; line-height:1.6;">Remaining term: <strong>${mo(r.remainingMonths)}</strong>. Fifteen percent of that is ${mo(r.fifteenPctMonths)}, so the statute's period — at least one year, at most three — is <strong>${mo(r.capMonths)}</strong>.</p>
      <div style="overflow-x:auto; margin-top:16px;">
        <table style="width:100%; border-collapse:collapse; font-size:13.5px;">
          <thead><tr><th style="text-align:left; padding:8px 0;"></th><th style="text-align:left;">Time approach<br><span class="text-muted" style="font-weight:400;">majority view</span></th><th style="text-align:left;">Rent approach<br><span class="text-muted" style="font-weight:400;">minority view</span></th></tr></thead>
          <tbody>
            <tr><td style="padding:6px 0;">Future rent allowed under (A)</td><td class="mono">${usd(r.timeApproachFuture)}</td><td class="mono">${usd(r.rentApproachFuture)}</td></tr>
            <tr><td style="padding:6px 0;">Unpaid rent already due under (B)</td><td class="mono">${usd(r.unpaidRent)}</td><td class="mono">${usd(r.unpaidRent)}</td></tr>
            <tr style="font-weight:600;"><td style="padding:6px 0;">Statutory cap</td><td class="mono">${usd(r.timeApproachCap)}</td><td class="mono">${usd(r.rentApproachCap)}</td></tr>
            ${allowedRow}
          </tbody>
        </table>
      </div>
      <p class="text-muted" style="font-size:12.5px; line-height:1.6; margin-top:16px;">${differ
        ? "The two methods differ here because the rent escalates: the time approach counts only the rent falling inside the capped period, while the rent approach takes 15 percent of all remaining rent."
        : "Both methods give the same figure here. They diverge only when rent changes over the remaining term."} Total rent remaining under the lease: ${usd(r.totalRemainingRent)}.</p>`;
  });
})(typeof window !== "undefined" ? window : globalThis);
