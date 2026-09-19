-- CREdocket — Counterparty surveillance: federal court filings + matches
--
-- court_filings holds new federal filings pulled daily from CourtListener
-- (all Chapter 11 petitions, plus civil suits found by searching each
-- saved portfolio entity as a party). filing_matches records which user's
-- portfolio entity matched which filing, and how confidently.
--
-- Written only by the ingest-court-filings Edge Function (service role).
-- Run this in the Supabase SQL Editor. Safe to re-run. Requires
-- case_valuation_project/schema_portfolio_entities.sql to have been run.

create table if not exists public.court_filings (
  id bigint generated always as identity primary key,
  source text not null default 'courtlistener',
  source_docket_id bigint not null,
  filing_type text not null check (filing_type in ('bankruptcy_ch11', 'civil')),
  court_id text not null,
  court_name text,
  docket_number text,
  case_name text not null,
  date_filed date not null,
  parties text[] not null default '{}',
  is_business boolean not null default false,
  docket_url text not null,
  ingested_at timestamptz not null default now(),
  unique (source, source_docket_id)
);

create index if not exists court_filings_type_date_idx
  on public.court_filings (filing_type, date_filed desc);

alter table public.court_filings enable row level security;

-- Public read is limited to business Chapter 11 petitions (the public
-- feed). Individual debtors and entity-driven civil hits are not exposed
-- to anonymous readers; users see their own civil hits via filing_matches.
drop policy if exists "Public can read business chapter 11 filings" on public.court_filings;
create policy "Public can read business chapter 11 filings"
  on public.court_filings for select
  using (filing_type = 'bankruptcy_ch11' and is_business);

create table if not exists public.filing_matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id bigint not null references public.portfolio_entities(id) on delete cascade,
  filing_id bigint not null references public.court_filings(id) on delete cascade,
  confidence text not null check (confidence in ('exact', 'probable')),
  matched_party text not null,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (entity_id, filing_id)
);

create index if not exists filing_matches_user_idx
  on public.filing_matches (user_id, created_at desc);

alter table public.filing_matches enable row level security;

drop policy if exists "Users read their own filing matches" on public.filing_matches;
create policy "Users read their own filing matches"
  on public.filing_matches for select
  using (auth.uid() = user_id);

-- Declared here because it references filing_matches, created above.
drop policy if exists "Users can read filings matched to them" on public.court_filings;
create policy "Users can read filings matched to them"
  on public.court_filings for select
  using (exists (
    select 1 from public.filing_matches m
    where m.filing_id = court_filings.id and m.user_id = auth.uid()
  ));

-- Lets the daily job search least-recently-checked entities first, so a
-- portfolio larger than one day's API budget is still fully covered on a
-- rolling basis.
alter table public.portfolio_entities
  add column if not exists last_federal_search_at timestamptz;
