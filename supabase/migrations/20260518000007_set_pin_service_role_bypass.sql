-- The pin-change Edge Function calls set_pin with the service-role admin
-- client AFTER verifying the old PIN. Service-role requests don't carry
-- user_metadata.app_user_id, so the round-2 admin guard would reject the
-- forced first-login PIN change. Allow service_role to bypass the caller
-- check; admin/self check still applies to authenticated callers.
create or replace function public.set_pin(p_user_id uuid, p_pin text)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
as $$
declare
  v_caller_id uuid;
  v_caller_is_admin boolean;
  v_role text;
begin
  v_role := nullif(current_setting('role', true), '');

  -- Service role (pin-change Edge Function, server-side jobs) bypasses
  -- the caller-identity check entirely — it's pre-authorised.
  if v_role <> 'service_role' then
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
  end if;

  update public.users
    set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
        must_change_pin = false,
        failed_attempts = 0,
        locked_until = null
    where id = p_user_id;
end;
$$;
