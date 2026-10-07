// Pure parts of the docket-follows function, kept apart for tests.

export type DocketEvent = {
  key: string;
  docketId: string | number;
  date: string | null;     // YYYY-MM-DD the court entered it
  kind: "ruling" | "closed";
  text: string;
  url?: string | null;
};
export type Follow = { id: number; user_id: string; docket_id: number; label: string; page_path: string; token: string; created_at: string };

// CourtListener receives entries late, sometimes by days, so an entry dated
// shortly before someone followed can still be news to them. Older than
// this and it was already on the page when they followed.
export const LAG_DAYS = 3;

export function eventsForFollow(f: Follow, events: DocketEvent[]): DocketEvent[] {
  const since = new Date(Date.parse(f.created_at) - LAG_DAYS * 86400000).toISOString().slice(0, 10);
  return events.filter((e) => String(e.docketId) === String(f.docket_id) && (e.date ?? "") >= since);
}

// One email per reader, listing every new event across the cases they follow.
export function groupByUser(follows: Follow[], events: DocketEvent[]): Map<string, { follow: Follow; events: DocketEvent[] }[]> {
  const out = new Map<string, { follow: Follow; events: DocketEvent[] }[]>();
  for (const f of follows) {
    const evs = eventsForFollow(f, events);
    if (!evs.length) continue;
    const list = out.get(f.user_id) ?? [];
    list.push({ follow: f, events: evs });
    out.set(f.user_id, list);
  }
  return out;
}

export function validEvent(e: unknown): e is DocketEvent {
  const x = e as DocketEvent;
  return !!x && typeof x.key === "string" && x.key.length > 0 && x.key.length <= 400 &&
    /^\d+$/.test(String(x.docketId)) && (x.kind === "ruling" || x.kind === "closed") &&
    typeof x.text === "string" && (x.date === null || /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)));
}
