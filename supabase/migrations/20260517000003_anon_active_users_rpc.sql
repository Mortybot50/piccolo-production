-- Fix: /login is a public page using the anon Supabase key. The initial
-- RLS grants SELECT on `users` to `authenticated` only, so the login picker
-- always rendered "No active users yet." and the Sign in button stayed
-- disabled. Reproduced 17/05/2026 22:24 AEST by Morty on real device.
--
-- Solution: SECURITY DEFINER function returns only the three fields the
-- login picker actually needs (id, display_name, must_change_pin) — never
-- pin_hash, locked_until, failed_attempts, etc. Granted to anon.
-- We do NOT broaden the RLS policy on the users table itself.

create or replace function public.list_active_users()
returns table (
  id uuid,
  display_name text,
  must_change_pin boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select u.id, u.display_name, u.must_change_pin
  from public.users u
  where u.active = true
  order by u.display_name;
$$;

-- Revoke from PUBLIC default and grant to anon + authenticated explicitly.
revoke execute on function public.list_active_users() from public;
grant execute on function public.list_active_users() to anon, authenticated;

comment on function public.list_active_users() is
  'Public-safe accessor for the /login user picker. Returns id, display_name, must_change_pin only. SECURITY DEFINER so it bypasses the RLS-blocks-anon policy on users without exposing pin_hash etc.';
