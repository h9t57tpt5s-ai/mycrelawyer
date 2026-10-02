import { assertEquals } from "jsr:@std/assert@1";
import { decideAlert, statusLabel } from "./alert-dedupe.ts";

Deno.test("first sync of a new matter sends a new-match alert", () => {
  assertEquals(decideAlert([], "filed", false), { send: true, kind: "new" });
});

Deno.test("re-sync at the same status sends nothing", () => {
  assertEquals(decideAlert(["filed"], "filed", true), { send: false, reason: "already-sent" });
  assertEquals(decideAlert(["filed"], "filed", false), { send: false, reason: "already-sent" });
});

Deno.test("baseline rows also suppress (old matters are not re-alerted)", () => {
  assertEquals(decideAlert(["pending"], "pending", true).send, false);
});

Deno.test("status change sends an update naming the previous status", () => {
  assertEquals(decideAlert(["pending", "filed"], "ruling", true), { send: true, kind: "status-change", previousStatus: "pending" });
});

Deno.test("a status seen before is never re-sent, even out of order", () => {
  assertEquals(decideAlert(["ruling", "filed"], "filed", true).send, false);
});

Deno.test("re-synced matter new to this target is labeled an update, not new", () => {
  assertEquals(decideAlert([], "ruling", true), { send: true, kind: "update" });
});

Deno.test("record table unavailable falls back to sending, labeled by resync", () => {
  assertEquals(decideAlert(null, "filed", false), { send: true, kind: "new" });
  assertEquals(decideAlert(null, "filed", true), { send: true, kind: "update" });
});

Deno.test("status labels match the site's", () => {
  assertEquals(statusLabel("ruling"), "Ruling Issued");
  assertEquals(statusLabel("appeal"), "On Appeal");
  assertEquals(statusLabel(""), "not stated");
});
