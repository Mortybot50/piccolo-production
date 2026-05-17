-- Lock down PIN crypto helpers: only service_role may execute.
-- The PostgREST default grants EXECUTE on public functions to PUBLIC,
-- which would expose verify_pin/set_pin via /rest/v1/rpc/* to anon and
-- authenticated — bypassing the rate limit + audit logic in pin-login.
revoke execute on function public.verify_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_pin(uuid, text) from public, anon, authenticated;

grant execute on function public.verify_pin(uuid, text) to service_role;
grant execute on function public.set_pin(uuid, text) to service_role;

-- Lock down search_path on the trigger fn so a hostile schema-overlay
-- can't hijack it via search_path manipulation.
alter function public.touch_updated_at() set search_path = public, pg_temp;
