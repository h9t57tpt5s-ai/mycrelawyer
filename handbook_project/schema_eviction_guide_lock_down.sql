-- CREdocket — Actually lock the Commercial Eviction Handbook behind sign-in
--
-- The prior "make it free" change (schema_eviction_guide_make_free.sql)
-- opened eviction_guide_chapters to the `anon` role too, which meant the
-- client-side "sign in to read this chapter" prompt was cosmetic only --
-- anyone could call the Supabase REST API directly with the public anon
-- key (always exposed in client-side JS regardless) and read every
-- state's full text without ever signing in. Separately, Texas's full
-- chapter text has always lived in the public js/eviction-guide-data.js
-- bundle, which ships to every visitor unconditionally -- no RLS policy
-- can gate a static file that's already sitting in the browser.
--
-- This migration fixes both:
--   1. Restricts eviction_guide_chapters to the `authenticated` role only,
--      so a real Supabase session is required at the database level, not
--      just in the page's own UI.
--   2. Moves Texas's full chapter into eviction_guide_chapters too, so it
--      is fetched (and gated) exactly like every other state. Run this
--      BEFORE deploying the matching js/eviction-guide.js and
--      js/eviction-guide-data.js changes that stop shipping Texas's full
--      text in the public bundle and fetch it from Supabase instead.
--
-- Run in Supabase SQL Editor.

drop policy if exists "Anyone can read eviction guide chapters" on public.eviction_guide_chapters;
drop policy if exists "Purchasers can read gated chapters" on public.eviction_guide_chapters;

create policy "Signed-in users can read eviction guide chapters"
  on public.eviction_guide_chapters for select
  to authenticated
  using (true);

insert into public.eviction_guide_chapters (slug, blurb, sections, updated_at)
values (
  'texas',
  $b$Chapter 93 lockout rights and a functioning summary-disposition procedure continue to give Texas landlords faster, lower-cost paths to possession than most jurisdictions.$b$,
  $s$[
    {
      "key": "statutoryNotice",
      "label": "Statutory Notice",
      "content": "Unless the parties have contracted for a shorter or longer notice period in a written lease or agreement, a landlord must give a tenant who defaults or holds over beyond the end of the rental term or renewal period at least three days' written notice to vacate before filing a forcible detainer suit. Beginning January 1, 2026, Texas Property Code § 24.005 distinguishes certain nonpayment actions by requiring a notice to pay rent or vacate when the tenant's right of possession is terminated solely for nonpayment of rent and the tenant was not delinquent before the month in which the notice was given. Section 24.005 also specifies approved notice-delivery methods, including mail, delivery inside the premises in a conspicuous place, hand delivery to a tenant age 16 or older, and approved electronic delivery where agreed in writing."
    },
    {
      "key": "selfHelp",
      "label": "Self-Help / Commercial Lockout",
      "content": "Texas continues to permit commercial lockouts under Chapter 93 of the Texas Property Code. A commercial landlord may change the door locks of a tenant who is delinquent in paying at least part of the rent. However, the landlord may not intentionally exclude a commercial tenant except by judicial process unless the exclusion results from bona fide repairs, construction, an emergency, abandonment, or a lockout authorized by § 93.002. The landlord must post written notice on the tenant’s front door identifying the person or company from which a new key may be obtained. Chapter 93 also provides a statutory reentry remedy if a tenant is unlawfully locked out."
    },
    {
      "key": "tenantReentry",
      "label": "Commercial Tenant Reentry",
      "content": "If a commercial tenant is locked out in violation of § 93.002, the tenant may file a sworn complaint for reentry in the justice court where the premises are located. The court may issue an ex parte writ of reentry granting temporary possession pending a final hearing if the court reasonably believes an unlawful lockout likely occurred. A writ of possession supersedes a writ of reentry."
    },
    {
      "key": "jurisdictionVenue",
      "label": "Jurisdiction and Venue",
      "content": "A justice court in the precinct where the leased premises are located has jurisdiction over eviction proceedings, and the eviction action must be filed in that precinct. The justice court adjudicates possession rights but does not determine title disputes. Counterclaims and third-party claims are not permitted in the eviction action and must be asserted separately."
    },
    {
      "key": "possessionProcedure",
      "label": "Possession Procedure",
      "content": "For eviction actions filed on or after January 1, 2026, Rule 510 governs eviction proceedings. Texas law now authorizes summary disposition procedures in specified forcible entry and detainer actions where no genuine dispute of material fact exists. A landlord may file a sworn motion for summary disposition together with the petition and obtain judgment without trial unless the tenant timely demonstrates the existence of a genuine factual dispute."
    },
    {
      "key": "timing",
      "label": "Timing",
      "content": "Service of the citation and petition generally must be attempted within five business days after filing. Trial must occur no earlier than the tenth day and no later than the twenty-first day after the petition is filed, may not occur earlier than the fourth day after service on the tenant, and may not be postponed more than seven days absent written agreement of the parties."
    },
    {
      "key": "damages",
      "label": "Damages",
      "content": "Texas continues to recognize acceleration provisions when properly drafted and continues to impose a duty to mitigate damages following abandonment of leased premises. Unpaid rent claims may be joined in the eviction action where permitted by Rule 510. Landlords should preserve future-rent remedies, acceleration rights, attorney-fee provisions, and post-possession damage claims in the lease documents."
    },
    {
      "key": "updateNote",
      "label": "2026 Update Note",
      "content": "Effective January 1, 2026, Chapter 24 of the Texas Property Code and Rule 510 underwent substantial revision through S.B. 38. The amendments address notice content, delivery methods, venue, computation of time, service requirements, summary disposition procedures, trial timing, and appellate procedures. Commercial landlords should ensure that all notices, lease forms, and eviction procedures are reviewed for compliance with the revised statutory framework."
    },
    {
      "key": "draftingConsiderations",
      "label": "Key Commercial Lease Drafting Considerations",
      "content": "Express acceleration clause.\nAttorney’s fees provision.\nSurvival of damages after repossession.\nContractual notice periods.\nElectronic notice authorization.\nCommercial lockout procedures.\nMitigation language.\nReservation of separate damages claims."
    },
    {
      "key": "sourceNotes",
      "label": "Source Notes",
      "content": "Statutory authorities reviewed: Texas Property Code Chapter 24 as amended by Acts 2025, 89th Leg., R.S., Ch. 960 (S.B. 38), effective January 1, 2026; Texas Property Code Chapter 93, Commercial Tenancies; and the Supreme Court of Texas amended order giving preliminary approval of amendments to Rule 143a and Part V of the Texas Rules of Civil Procedure, Misc. Docket No. 25-9105, dated December 31, 2025."
    }
  ]$s$::jsonb,
  now()
)
on conflict (slug) do update set
  blurb = excluded.blurb,
  sections = excluded.sections,
  updated_at = now();

notify pgrst, 'reload schema';
