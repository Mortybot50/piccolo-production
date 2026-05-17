-- Replace the previous blanket grant with an admin-checked wrapper.
-- Per Codex review round 2 (18/05/2026), letting every authenticated user
-- call set_pin reopened the password-reset bypass. We now:
--   - Add users.is_admin boolean (default false)
--   - Seed Damian as admin
--   - Make set_pin enforce: caller must be admin OR caller == target
--   - Grant execute back to authenticated (the function self-guards)

alter table public.users
  add column if not exists is_admin boolean not null default false;

update public.users set is_admin = true
  where display_name = 'Damian' and is_admin = false;

create or replace function public.set_pin(p_user_id uuid, p_pin text)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
as $$
declare
  v_caller_id uuid;
  v_caller_is_admin boolean;
begin
  -- Resolve caller from the custom PIN JWT (user_metadata.app_user_id).
  v_caller_id := nullif(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'user_metadata' ->> 'app_user_id',
    ''
  )::uuid;

  if v_caller_id is null then
    raise exception 'set_pin: caller not authenticated';
  end if;

  select is_admin into v_caller_is_admin
    from public.users where id = v_caller_id;

  if v_caller_is_admin is not true and v_caller_id <> p_user_id then
    raise exception 'set_pin: only admins can reset another user''s PIN';
  end if;

  update public.users
    set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
        must_change_pin = false,
        failed_attempts = 0,
        locked_until = null
    where id = p_user_id;
end;
$$;

-- Grant execute to authenticated; the in-function check is the gate.
revoke execute on function public.set_pin(uuid, text) from public;
grant execute on function public.set_pin(uuid, text) to authenticated, service_role;
