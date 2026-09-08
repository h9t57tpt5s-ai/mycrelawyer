-- CREdocket — Settlement Contribution Exchange: schema
-- Lets a signed-in user upload a petition/complaint + a non-confidential
-- settlement agreement (or final order/judgment) for a real matter and
-- earn free Case Value Calculator credits once a human reviewer approves
-- it. Modeled on CompStak's contribute-to-unlock exchange, adapted for
-- litigation outcomes instead of lease/sale comps.
--
-- Design choices worth flagging:
-- 1. Extracted document TEXT is stored (not the raw file) -- enough for a
--    human reviewer to read and verify, without standing up a Storage
--    bucket for v1. Revisit if volume/audit needs grow.
-- 2. Credits are granted on APPROVAL, never on submission -- prevents
--    gaming the credit system with garbage/duplicate/fabricated uploads.
-- 3. A submission the automated confidentiality-clause scanner flags
--    lands in 'flagged', not 'rejected' -- a human still reviews it
--    rather than either auto-approving or auto-discarding a borderline
--    case (the scanner is a safety net, not a verdict).
-- 4. RLS: a user can INSERT and can SELECT only their own rows (to see
--    their submission's status) -- everything else (status changes,
--    credit grants) is service-role-only, done by the
--    admin-review-contribution Edge Function after a human decision.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.settlement_contributions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Extracted structured facts (best-guess by AI extraction; a reviewer
  -- can hand-correct these before approval by re-running the extraction
  -- or editing directly in the SQL editor -- no edit UI in v1).
  category text,                    -- one of the 8 tracked litigation categories, or null if unclear
  property_type text,               -- office / retail / multifamily / industrial / etc., or null
  jurisdiction text,                -- state, or null
  claimed_amount numeric,
  settled_amount numeric,
  key_factual_drivers text,         -- short AI-written summary of what drove the outcome
  filed_date date,
  resolved_date date,
  insurance_contribution text,      -- short free-text note, or null if not mentioned
  case_caption text,                -- PRIVATE -- never exposed via the public benchmarks function
  court_or_docket text,             -- PRIVATE -- never exposed via the public benchmarks function

  -- Full extracted text of both documents, for reviewer verification.
  -- Capped client-side before submission (see js/contribute-settlement.js).
  petition_text text not null,
  settlement_text text not null,

  -- Trust & safety
  user_attested_non_confidential boolean not null,
  confidentiality_flag_detected boolean not null default false,
  confidentiality_flag_reason text,

  status text not null default 'pending_review'
    check (status in ('pending_review', 'flagged', 'approved', 'rejected')),
  rejection_reason text,
  credits_awarded integer,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.settlement_contributions enable row level security;

drop policy if exists "Users can submit their own contribution" on public.settlement_contributions;
create policy "Users can submit their own contribution"
  on public.settlement_contributions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own contributions" on public.settlement_contributions;
create policy "Users can view their own contributions"
  on public.settlement_contributions for select
  to authenticated
  using (auth.uid() = user_id);

-- Deliberately NO update/delete policy for authenticated users -- status
-- changes and credit grants happen only via the admin-review-contribution
-- Edge Function, which uses the service-role key and bypasses RLS.

create index if not exists settlement_contributions_status_idx
  on public.settlement_contributions (status, created_at);
create index if not exists settlement_contributions_user_idx
  on public.settlement_contributions (user_id, created_at);

-- =========================================================
-- Public aggregate benchmarks -- a SECURITY DEFINER function, not a bare
-- view. This is the standard, safe Supabase pattern for exposing a safe
-- aggregate over an RLS-protected table: it runs with the function
-- owner's privileges (bypassing the base table's RLS internally) but can
-- only ever return the aggregated columns below -- never a raw row, never
-- case_caption/court_or_docket, never the document text. The
-- `having count(*) >= 3` floor is a real de-anonymization guard: without
-- it, a narrow slice (one category + one state + one property type) could
-- reduce to a single contributor's own settlement amount.
-- =========================================================
create or replace function public.get_settlement_benchmarks()
returns table (
  category text,
  jurisdiction text,
  property_type text,
  contribution_count bigint,
  median_settled numeric,
  min_settled numeric,
  max_settled numeric,
  avg_settled numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    category,
    jurisdiction,
    property_type,
    count(*) as contribution_count,
    percentile_cont(0.5) within group (order by settled_amount) as median_settled,
    min(settled_amount) as min_settled,
    max(settled_amount) as max_settled,
    avg(settled_amount) as avg_settled
  from public.settlement_contributions
  where status = 'approved' and settled_amount is not null
  group by category, jurisdiction, property_type
  having count(*) >= 3
  order by category, jurisdiction, property_type;
$$;

grant execute on function public.get_settlement_benchmarks() to anon, authenticated;

notify pgrst, 'reload schema';
