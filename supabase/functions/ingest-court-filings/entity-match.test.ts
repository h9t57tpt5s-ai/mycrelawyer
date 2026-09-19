import { looksLikeBusiness, matchEntity } from "./entity-match.ts";

function expectMatch(entity: string, party: string, want: string | null) {
  const got = matchEntity(entity, party);
  if (got !== want) throw new Error(`matchEntity(${JSON.stringify(entity)}, ${JSON.stringify(party)}) = ${got}, want ${want}`);
}

// Party strings below are real ones returned by CourtListener on 2026-09-18.
Deno.test("designators and punctuation do not block an exact match", () => {
  expectMatch("Harbor Group Management", "Harbor Group Management Co., LLC", "exact");
  expectMatch("Simon Property Group", "SIMON PROPERTY GROUP, L.P.", "exact");
  expectMatch("Evergreen Consolidated, L.L.C.", "Evergreen Consolidated LLC", "exact");
  expectMatch("The Michaels Stores, Inc.", "MICHAELS STORES INC.", "exact");
});

Deno.test("d/b/a aliases are each compared", () => {
  expectMatch("Bank of Texas", "Bank of Oklahoma, N.A. d/b/a Bank of Texas, N.A.", "exact");
  expectMatch("Bank of Oklahoma", "Bank of Oklahoma, N.A. d/b/a Bank of Texas, N.A.", "exact");
});

Deno.test("multi-word containment is probable, not exact", () => {
  expectMatch("Summit Hotel", "Summit Hotel Properties, Inc.", "probable");
  expectMatch("Deutsche Bank National Trust Company", "Deutsche Bank National Trust Company as Indenture Trustee for the FBR Securitization Trust 2005-5", "probable");
});

Deno.test("a single shared word never matches", () => {
  expectMatch("Summit", "Summit Trucking LLC", null);
  expectMatch("Eskil", "Eskil Trucking Inc.", null);
  expectMatch("Harbor", "Harbor Group Management Co., LLC", null);
});

Deno.test("generic-only names never match", () => {
  expectMatch("Holdings LLC", "Acme Holdings LLC", null);
  expectMatch("Property Management", "Summit Property Management Inc", null);
  expectMatch("The Group", "The Group", null);
});

Deno.test("a leading-name prefix is probable", () => {
  expectMatch("Allred Heating", "Allred Heating Cooling Electric, LLC", "probable");
});

Deno.test("trust is part of the name, not a suffix", () => {
  expectMatch("Northern Trust", "Northern LLC", null);
  expectMatch("Northern Trust", "The Northern Trust Company", "exact");
});

Deno.test("different entities sharing words do not match", () => {
  expectMatch("Corey Williams Hauling", "Williams Hauling LLC", null);
  expectMatch("Williams Hauling", "Corey Williams Hauling LLC", null);
  expectMatch("DZS Enterprise Services", "DZS Enterprises", null);
  expectMatch("NewRez", "Select Portfolio Servicing, Inc.", null);
});

Deno.test("business heuristic separates entities from individuals", () => {
  for (const n of ["Eskil Trucking Inc.", "DZS Enterprise Services, LLC", "SIMON PROPERTY GROUP, L.P.", "Bank of Oklahoma, N.A."]) {
    if (!looksLikeBusiness(n)) throw new Error(`${n} should look like a business`);
  }
  for (const n of ["Michael John Charman", "Ronald Lawrence Le Gros"]) {
    if (looksLikeBusiness(n)) throw new Error(`${n} should not look like a business`);
  }
});

// Known, deliberate limitation: users should save full legal names.
Deno.test("single-word names match only an identical core", () => {
  expectMatch("Walgreens", "Walgreens, Inc.", "exact");
  expectMatch("Walgreens", "Walgreens Boots Alliance, Inc.", null);
});
