-- CREdocket — Server-side cap on portfolio_entities per user
--
-- Portfolio (case_valuation_project/schema_portfolio_entities.sql) has
-- always capped entities per user at a constant checked in
-- js/portfolio-entities.js before each insert (originally 50, raised to
-- 500 on 2026-09-16 alongside adding real CSV bulk import -- see that
-- file's MAX_ENTITIES comment for the reasoning on the number itself).
--
-- That client-side check was never a real security boundary: the
-- portfolio_entities RLS policy only requires auth.uid() = user_id, so
-- any signed-in user can call the Supabase REST API directly with their
-- own anon key + session token (both already exposed in the browser) and
-- insert rows without ever running js/portfolio-entities.js at all. Not
-- a concern while bulk add was "paste one name per line" and the cap was
-- a soft UX nudge, but CSV bulk import (2026-09-16) makes it easy to
-- generate a very large payload, and this table is scanned in full, for
-- every user, on every newly-synced case, by
-- supabase/functions/check-and-send-watchlist-alerts -- an unbounded
-- table is a real cost/latency vector for that job, not just a storage
-- one. This migration adds the actual enforcement point.
--
-- Run this in the Supabase SQL Editor. Safe to re-run (both the function
-- and the trigger are dropped/recreated). Requires
-- case_valuation_project/schema_portfolio_entities.sql to have already
-- been run (the table must exist).
--
-- If the per-account cap number ever changes, update BOTH this file's
-- entity_cap constant and MAX_ENTITIES in js/portfolio-entities.js --
-- there is deliberately no single source of truth shared between the
-- database and the static site's JS.

create or replace function public.enforce_portfolio_entities_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_cap constant integer := 500;
  existing_count integer;
begin
  select count(*) into existing_count
  from public.portfolio_entities
  where user_id = new.user_id;

  if existing_count >= entity_cap then
    raise exception
      'Portfolio entity limit reached (% per account) — remove some entries before adding more.',
      entity_cap
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists portfolio_entities_cap_trigger on public.portfolio_entities;
create trigger portfolio_entities_cap_trigger
  before insert on public.portfolio_entities
  for each row
  execute function public.enforce_portfolio_entities_cap();

-- Note on bulk inserts: this trigger runs once per row (FOR EACH ROW),
-- re-counting each time, so a single multi-row insert statement (as
-- js/portfolio-entities.js's CSV import issues, in chunks of 200) is
-- still correctly capped even though it's one client-side call --
-- Postgres evaluates row triggers within the same statement in order,
-- and each one sees the previous rows already inserted by that
-- statement when it does its count.
