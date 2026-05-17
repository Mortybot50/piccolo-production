-- Piccolo Production — initial auth migration
-- Phase A: users table + PIN crypto helpers + seed Damian.
-- Idempotent — safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  pin_hash text not null,
  must_change_pin boolean not null default false,
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_display_name_unique
  on public.users (lower(display_name)) where active;

-- updated_at bump trigger.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_touch on public.users;
create trigger users_touch
  before update on public.users
  for each row execute function public.touch_updated_at();

-- PIN verify helper (security-definer; takes user_id + plain pin, returns boolean).
create or replace function public.verify_pin(p_user_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select pin_hash into v_hash from public.users where id = p_user_id;
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_pin, v_hash);
end;
$$;

-- PIN set helper (security-definer; bcrypts and stores the new pin).
create or replace function public.set_pin(p_user_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.users
    set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
        must_change_pin = false,
        failed_attempts = 0,
        locked_until = null
    where id = p_user_id;
end;
$$;

revoke all on function public.verify_pin(uuid, text) from public;
revoke all on function public.set_pin(uuid, text) from public;
grant execute on function public.verify_pin(uuid, text) to service_role;
grant execute on function public.set_pin(uuid, text) to service_role;

-- RLS — single-role app: authenticated users have full access; anon has none.
alter table public.users enable row level security;

drop policy if exists users_select_authenticated on public.users;
drop policy if exists users_insert_authenticated on public.users;
drop policy if exists users_update_authenticated on public.users;
drop policy if exists users_delete_authenticated on public.users;

create policy users_select_authenticated on public.users
  for select to authenticated using (true);
create policy users_insert_authenticated on public.users
  for insert to authenticated with check (true);
create policy users_update_authenticated on public.users
  for update to authenticated using (true) with check (true);
create policy users_delete_authenticated on public.users
  for delete to authenticated using (true);

-- Seed Damian with PIN 1234, must_change_pin = true.
insert into public.users (display_name, pin_hash, must_change_pin, active)
  select 'Damian', crypt('1234', gen_salt('bf', 10)), true, true
  where not exists (
    select 1 from public.users where lower(display_name) = 'damian'
  );
