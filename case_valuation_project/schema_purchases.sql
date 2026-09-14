-- CREdocket — Litigation Value Estimator: paid-tier entitlement table
-- Credit-based, not "ever purchased = unlimited forever": each purchase
-- grants a fixed number of analysis runs. A future monthly subscription
-- can slot in via plan_type without changing this table's shape --
-- one_time_credits rows are cumulative (never expire, add up across
-- multiple purchases); a later monthly_subscription plan_type would be
-- checked against usage in the CURRENT billing period instead of
-- all-time usage. Only one_time_credits is wired up right now.
--
-- Run this in the Supabase SQL Editor. If you already ran the earlier
-- version of this file, this one is safe to run again -- the `alter
-- table` lines below add the new column without touching existing data.

create table if not exists public.case_valuation_purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_customer_email text,
  amount_total bigint,
  plan_type text not null default 'one_time_credits',
  credits_granted integer not null default 10,
  purchased_at timestamptz not null default now()
);

-- Safe to run even if the table already existed from an earlier version
-- of this script without these columns.
alter table public.case_valuation_purchases add column if not exists plan_type text not null default 'one_time_credits';
alter table public.case_valuation_purchases add column if not exists credits_granted integer not null default 10;

alter table public.case_valuation_purchases enable row level security;

drop policy if exists "Users can check their own purchase" on public.case_valuation_purchases;
create policy "Users can check their own purchase"
  on public.case_valuation_purchases for select
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
