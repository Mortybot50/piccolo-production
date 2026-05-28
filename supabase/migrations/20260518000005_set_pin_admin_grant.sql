-- Re-grant execute on set_pin to authenticated so the Users settings tab
-- (PIN reset + create user flows in UsersCard.tsx) can call it from the
-- browser. The function is SECURITY DEFINER and the shop has < 5 trusted
-- employees, so a soft trust model is acceptable. Verify_pin stays
-- service_role only (still callable from the pin-login edge function).
grant execute on function public.set_pin(uuid, text) to authenticated;
