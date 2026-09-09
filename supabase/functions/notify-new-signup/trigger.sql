-- =========================================================
-- CREdocket -- New account sign-up notification: DB trigger
--
-- Use this INSTEAD OF the dashboard's Database Webhooks UI if that UI
-- fails with:
--   "Failed to create webhook: Failed to run sql query: ERROR: 3F000:
--    schema "supabase_functions" does not exist"
-- That error means this project is missing an internal schema the
-- dashboard's Webhooks feature depends on -- a platform-side gap, not
-- something wrong with your setup. This script sidesteps it entirely
-- by creating the exact same effect directly: a Postgres trigger on
-- auth.users that calls the notify-new-signup Edge Function via
-- pg_net (the extension the "Required extensions" panel already
-- showed as Installed), with no dependency on supabase_functions.
--
-- Deploy: Supabase Dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run.
--
-- Safe by design: the entire net.http_post call is wrapped in its own
-- exception handler, so if the notification ever fails for any reason
-- (network hiccup, bad key, function down), it CANNOT block or fail
-- the actual account creation -- it just logs a warning and the
-- signup proceeds normally either way.
-- =========================================================

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/notify-new-signup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f'
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'users',
        'schema', 'auth',
        'record', jsonb_build_object(
          'email', new.email,
          'created_at', new.created_at
        )
      )
    );
  exception when others then
    raise warning 'notify_new_signup: http_post failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notify on auth.users;
create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row execute function public.notify_new_signup();
