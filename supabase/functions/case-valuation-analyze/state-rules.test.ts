import { jurisdictionRules, stateCode } from "./state-rules.ts";
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

Deno.test("state names and codes resolve", () => {
  assert(stateCode("Texas") === "TX" && stateCode("tx") === "TX", "Texas");
  assert(stateCode("New York") === "NY", "New York");
  assert(stateCode("District of Columbia") === "DC" && stateCode("Washington, D.C.") === "DC", "DC");
  assert(stateCode("Narnia") === null && stateCode(null) === null, "unknown");
});

Deno.test("every jurisdiction has a rules entry", () => {
  for (const code of ["AL", "CA", "DC", "NY", "TX", "WY"]) assert(jurisdictionRules(code, "lease-disputes"), code);
});

Deno.test("New York: 9%, contract rate controls", () => {
  const r = jurisdictionRules("New York", "lease-disputes")!;
  assert(r.prejudgmentInterest.summary.startsWith("9%"), r.prejudgmentInterest.summary);
  assert(r.prejudgmentInterest.summary.includes("lease or note controls"), "contract rate");
  assert(r.deficiency === null, "deficiency shown only for lending");
});

Deno.test("Tennessee is discretionary with a ceiling, and lending shows deficiency rules", () => {
  const r = jurisdictionRules("Tennessee", "lending-foreclosure")!;
  assert(r.prejudgmentInterest.summary.startsWith("Discretionary with the court, up to 10%"), r.prejudgmentInterest.summary);
  assert(r.deficiency !== null, "deficiency present for lending");
});
