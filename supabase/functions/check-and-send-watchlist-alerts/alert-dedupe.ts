// Whether to email a watchlist or portfolio match, and how to label it.
// Pure so it can be tested (alert-dedupe.test.ts).
//
// priorStatuses: the case statuses this target was already alerted (or
// baselined) at for this matter, newest first; null when the record
// table is unavailable (migration not run yet).
// resync: the sync job has processed this matter before.

export type AlertDecision =
  | { send: false; reason: "already-sent" }
  | { send: true; kind: "new" }
  | { send: true; kind: "status-change"; previousStatus: string }
  | { send: true; kind: "update" };

export function decideAlert(priorStatuses: string[] | null, status: string, resync: boolean): AlertDecision {
  if (priorStatuses === null) return resync ? { send: true, kind: "update" } : { send: true, kind: "new" };
  if (priorStatuses.includes(status)) return { send: false, reason: "already-sent" };
  if (priorStatuses.length) return { send: true, kind: "status-change", previousStatus: priorStatuses[0] };
  return resync ? { send: true, kind: "update" } : { send: true, kind: "new" };
}

const STATUS_LABELS: Record<string, string> = {
  filed: "Filed",
  pending: "Pending",
  ruling: "Ruling Issued",
  settled: "Settled",
  appeal: "On Appeal",
};

export function statusLabel(status: string | undefined | null): string {
  if (!status) return "not stated";
  return STATUS_LABELS[status] ?? status;
}
