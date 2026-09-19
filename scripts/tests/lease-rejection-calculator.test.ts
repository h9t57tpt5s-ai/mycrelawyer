import "../../js/lease-rejection-calculator.js";
// deno-lint-ignore no-explicit-any
const f = (globalThis as any).RELAW_LEASE_REJECTION.computeLeaseRejectionCap;
function near(got: number, want: number, label: string) {
  if (Math.abs(got - want) > 1) throw new Error(`${label}: got ${got}, want ${want}`);
}
Deno.test("10 years flat: 15% = 18 months; both approaches agree", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2036-01-01", monthlyRent: 10000 });
  near(r.remainingMonths, 120, "months"); near(r.capMonths, 18, "cap months");
  near(r.timeApproachCap, 180000, "time"); near(r.rentApproachCap, 180000, "rent");
});
Deno.test("3 years flat: one-year floor applies", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2029-01-01", monthlyRent: 10000 });
  near(r.capMonths, 12, "cap months"); near(r.timeApproachCap, 120000, "time"); near(r.rentApproachCap, 120000, "rent");
});
Deno.test("25 years flat: three-year ceiling applies", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2051-01-01", monthlyRent: 10000 });
  near(r.capMonths, 36, "cap months"); near(r.timeApproachCap, 360000, "time"); near(r.rentApproachCap, 360000, "rent");
});
Deno.test("10 years with 3% escalations: approaches diverge", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2036-01-01", monthlyRent: 10000, annualEscalationPct: 3 });
  near(r.timeApproachFuture, 120000 + 6 * 10300, "time");           // 181,800
  let total = 0; for (let k = 0; k < 10; k++) total += 120000 * Math.pow(1.03, k);
  near(r.totalRemainingRent, total, "total"); near(r.rentApproachFuture, total * 0.15, "rent"); // ~206,350
});
Deno.test("6 months left: cap cannot exceed the rent the lease has left", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2026-07-01", monthlyRent: 10000 });
  near(r.timeApproachCap, 60000, "time"); near(r.rentApproachCap, 60000, "rent");
});
Deno.test("unpaid rent is added; actual damages below the cap control", () => {
  const r = f({ startDate: "2026-01-01", leaseEndDate: "2036-01-01", monthlyRent: 10000, unpaidRent: 25000, actualDamages: 150000 });
  near(r.timeApproachCap, 205000, "cap"); near(r.allowedTime, 150000, "allowed");
});
Deno.test("bad input returns an error, not a number", () => {
  if (!f({ startDate: "2026-01-01", leaseEndDate: "2025-01-01", monthlyRent: 10000 }).error) throw new Error("expected error");
  if (!f({ startDate: "2026-01-01", leaseEndDate: "2030-01-01", monthlyRent: 0 }).error) throw new Error("expected error");
});
