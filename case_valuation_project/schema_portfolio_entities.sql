-- CREdocket — Portfolio Import & Automated Entity Alerts
--
-- The #1 finding across all 100 personas in the stakeholder review
-- (case_valuation_project/ — see the "100 Voices, One Gap" memo):
-- Watchlists only work by manually typed company/state/category, with
-- no way to upload a user's ACTUAL properties, tenants, lenders, or
-- counterparties for automatic, personalized alerting. Every single
-- stakeholder group named this as both their biggest gap and their
-- highest-value fix, independently.
--
-- This table is the data model for that: a user's own named entities
-- (a property address, a tenant, a lender, a guarantor, or any other
-- counterparty they want matched against every new matter added to the
-- tracker, not just ones they remembered to watch by category/state).
--
-- Distinct from the existing `watchlists` table (which tracks a
-- company/state/category triple, not a user's own free-text entities)
-- -- this is deliberately a separate table rather than an extension of
-- watchlists, since the matching logic (fuzzy name matching against
-- `cases[].parties[].name`) is fundamentally different from watchlists'
-- exact-id matching.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.portfolio_entities (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The entity's name AS IT WOULD APPEAR in a real matter -- e.g. the
  -- exact legal name of a property-owning LLC, a tenant's corporate
  -- name, a lender, or a guarantor. Matched (fuzzy, case-insensitive,
  -- substring-tolerant) against `parties[].name` on every tracked
  -- matter -- see the matching logic in
  -- supabase/functions/check-and-send-watchlist-alerts (extended to
  -- cover this table alongside its existing company/state/category
  -- watchlist matching).
  entity_name text not null,

  -- What kind of entity this is, for display/grouping only -- does not
  -- affect matching (a lender could show up as a "Defendant" in a
  -- lender-liability suit just as easily as a "Lender").
  entity_type text not null default 'counterparty'
    check (entity_type in ('property', 'tenant', 'lender', 'guarantor', 'counterparty', 'other')),

  -- Optional free-text note so the user remembers why they added this
  -- entity months later -- e.g. "our tenant at 400 Market St" or
  -- "guarantor on the Riverside loan".
  notes text,

  created_at timestamptz not null default now()
);

alter table public.portfolio_entities enable row level security;

drop policy if exists "Users manage their own portfolio entities" on public.portfolio_entities;
create policy "Users manage their own portfolio entities"
  on public.portfolio_entities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Reasonable per-user cap so this can't be abused as unbounded storage
-- -- enforced at the application layer (the account.html UI), not here;
-- this comment is just a reminder to add that check when building the
-- UI, matching the pattern free-tier limits already use elsewhere on
-- the site (case_views' MONTHLY_LIMIT, etc.).
