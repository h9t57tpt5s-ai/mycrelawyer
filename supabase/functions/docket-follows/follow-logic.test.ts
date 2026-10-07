import { assertEquals } from "jsr:@std/assert@1";
import { eventsForFollow, groupByUser, validEvent, type DocketEvent, type Follow } from "./follow-logic.ts";

const follow = (over: Partial<Follow> = {}): Follow => ({
  id: 1, user_id: "u1", docket_id: 74924804, label: "LZA Real Properties East, LLC",
  page_path: "/chapter-11/x.html", token: "t", created_at: "2026-10-07T15:00:00Z", ...over,
});
const ev = (over: Partial<DocketEvent> = {}): DocketEvent => ({
  key: "74924804:12:2026-10-08:order granting", docketId: "74924804", date: "2026-10-08",
  kind: "ruling", text: "Order Granting Motion to Use Cash Collateral", ...over,
});

Deno.test("an event on the followed docket after the follow is sent", () => {
  assertEquals(eventsForFollow(follow(), [ev()]).length, 1);
});

Deno.test("another docket's event is not sent", () => {
  assertEquals(eventsForFollow(follow(), [ev({ docketId: "111" })]).length, 0);
});

Deno.test("an entry dated a few days before the follow still counts (CourtListener lag)", () => {
  assertEquals(eventsForFollow(follow(), [ev({ date: "2026-10-04" })]).length, 1);
});

Deno.test("an old ruling that was already on the page is not sent", () => {
  assertEquals(eventsForFollow(follow(), [ev({ date: "2026-09-20" })]).length, 0);
});

Deno.test("one email per reader across several followed cases", () => {
  const g = groupByUser(
    [follow(), follow({ id: 2, docket_id: 222 }), follow({ id: 3, user_id: "u2" })],
    [ev(), ev({ key: "222:1", docketId: 222 })],
  );
  assertEquals(g.get("u1")!.length, 2);
  assertEquals(g.get("u2")!.length, 1);
});

Deno.test("malformed events are rejected", () => {
  assertEquals(validEvent(ev()), true);
  assertEquals(validEvent({ ...ev(), docketId: "abc" }), false);
  assertEquals(validEvent({ ...ev(), kind: "filed" }), false);
  assertEquals(validEvent({ ...ev(), date: "Oct 8" }), false);
});
