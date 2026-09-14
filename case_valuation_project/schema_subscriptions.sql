-- CREdocket — Recurring subscriptions (Practitioner / Firm tiers)
-- Adds the "monthly_subscription" plan_type that case_valuation_purchases'
-- and case_valuation_analyses' own header comments have anticipated since
-- they were written ("A future monthly subscription would grant credits
-- that reset each billing period instead of accumulating -- not wired up
-- yet"). Additive only -- does not change the existing one-time
-- $49/10-credit pack flow at all, which keeps working exactly as today
-- for anyone who never subscribes.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.

-- One row per active-or-formerly-active subscription. A user with no row
-- here (the overwhelming majority, including every Free-tier user and
-- every one-time-pack buyer who never subscribes) is just evaluated
-- against the existing case_valuation_purchases flow, unchanged.
create table if not exists public.case_valuation_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_customer_id text not null,
  stripe_customer_email text,
  -- 'practitioner' | 'firm' -- drives monthly_credit_allotment and the
  -- unlimited-full-write-up unlock in js/auth.js. Kept as free text (not
  -- an enum) so adding a future tier is a data change, not a migration.
  plan_type text not null,
  monthly_credit_allotment integer not null,
  -- 'active' | 'past_due' | 'canceled' -- mirrors Stripe's own subscription
  -- status closely enough for this app's purposes (Stripe has finer-
  -- grained statuses like 'trialing'/'unpaid'/'incomplete'; those all map
  -- to 'past_due' here since the practical question is only "does this
  -- grant access right now," not the exact billing nuance).
  status text not null default 'active',
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.case_valuation_subscriptions enable row level security;

drop policy if exists "Users can view their own subscription" on public.case_valuation_subscriptions;
create policy "Users can view their own subscription"
  on public.case_valuation_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists case_valuation_subscriptions_user_idx
  on public.case_valuation_subscriptions (user_id);

-- Distinguishes which pool a logged analysis actually drew down --
-- 'subscription' usage must NOT subtract from a one-time credit balance
-- (and vice versa), or a subscriber's monthly-allotment usage would
-- incorrectly deplete a one-time pack they may not have even bought, and
-- a later top-up pack's balance would be muddled with subscription-period
-- usage from before it existed. Defaults to 'one_time' so every existing
-- historical row (all usage logged before this column existed, all of it
-- genuinely against the one-time pool) is correctly attributed with no
-- backfill needed.
alter table public.case_valuation_analyses add column if not exists credit_source text not null default 'one_time';

notify pgrst, 'reload schema';
