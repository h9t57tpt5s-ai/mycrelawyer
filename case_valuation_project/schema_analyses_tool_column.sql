-- CREdocket — usage log: attribute rows to which AI tool made them
--
-- The Lease Clause Redline Checker deliberately shares the Litigation
-- Value Estimator's credit pool and daily burst cap (both read/write
-- the same case_valuation_purchases / case_valuation_analyses tables)
-- rather than having its own -- this column is for reporting which
-- tool a given usage row came from, it does NOT gate anything.
--
-- Run this in the Supabase SQL Editor, alongside the earlier schema
-- files -- additive, safe to run even if already applied.

alter table public.case_valuation_analyses add column if not exists tool text not null default 'case-valuation';

notify pgrst, 'reload schema';
