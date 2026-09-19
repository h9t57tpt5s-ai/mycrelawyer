-- CREdocket — Counterparty surveillance: allow SEC Form 8-K event rows
--
-- Adds 'sec_8k' as a court_filings.filing_type (rows written by the same
-- ingest-court-filings function, sourced from SEC EDGAR). Until this is
-- run the database rejects those rows; the daily job tolerates that and
-- keeps storing court filings.
--
-- Public visibility is limited to Item 1.03 (Bankruptcy or Receivership).
-- Items 2.04 and 3.01 also cover benign events (an early note redemption,
-- a voluntary exchange transfer), so they are used only for private
-- portfolio alerts, never listed publicly next to a company's name.
--
-- Run this in the Supabase SQL Editor after
-- 20260919_court_filings_surveillance.sql. Safe to re-run.

do $$
declare c record;
begin
  -- Drop whatever the filing_type check is currently named.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.court_filings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%filing_type%'
  loop
    execute format('alter table public.court_filings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.court_filings
  add constraint court_filings_filing_type_check
  check (filing_type in ('bankruptcy_ch11', 'civil', 'sec_8k'));

drop policy if exists "Public can read business chapter 11 filings" on public.court_filings;
drop policy if exists "Public can read bankruptcy filings and disclosures" on public.court_filings;
create policy "Public can read bankruptcy filings and disclosures"
  on public.court_filings for select
  using (
    (filing_type = 'bankruptcy_ch11' and is_business)
    or (filing_type = 'sec_8k' and docket_number like 'Item 1.03:%')
  );
