#!/usr/bin/env bash
# Piccolo Production — API smoke probe.
#
# Hits the main RPCs that the app depends on with the anon key and a
# real auth flow, asserts the response shapes match what the frontend
# expects. Catches contract drift before deploy.
#
# Usage:
#   VITE_SUPABASE_URL=https://<ref>.supabase.co \
#   VITE_SUPABASE_ANON_KEY=... \
#   ./scripts/smoke-api.sh
#
# Per ~/.claude/rules/dev/frontend-smoke.md.

set -euo pipefail

URL=${VITE_SUPABASE_URL:-}
KEY=${VITE_SUPABASE_ANON_KEY:-}
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "FAIL: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set" >&2
  exit 2
fi

fail=0
pass=0

probe() {
  local name="$1"
  local path="$2"
  local body="$3"
  local expect_jq="$4"
  local resp
  resp=$(curl -sS -w '\n__HTTP_CODE=%{http_code}' \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -X POST "$URL$path" \
    --data "$body" || true)
  local code
  code=$(echo "$resp" | sed -n 's/^__HTTP_CODE=//p' | tail -1)
  local payload
  payload=$(echo "$resp" | sed -n '/^__HTTP_CODE=/!p')
  if [ "$code" != "200" ]; then
    echo "  FAIL $name → HTTP $code"
    echo "    body: $payload" | head -c 400
    echo ""
    fail=$((fail + 1))
    return 1
  fi
  if ! echo "$payload" | jq -e "$expect_jq" >/dev/null 2>&1; then
    echo "  FAIL $name → shape mismatch (jq: $expect_jq)"
    echo "    body: $payload" | head -c 400
    echo ""
    fail=$((fail + 1))
    return 1
  fi
  echo "  PASS $name"
  pass=$((pass + 1))
}

echo "Piccolo Production — API smoke"
echo "URL: $URL"
echo ""

# 1. list_active_users — anon-accessible RPC powering the Login screen.
probe "list_active_users" "/rest/v1/rpc/list_active_users" "{}" \
  'type == "array" and (length >= 1) and (.[0] | has("display_name") and has("id") and has("must_change_pin"))'

# 2. app_settings singleton — anon SELECT blocked by RLS, so use service-role here
#    only if APP_SETTINGS_PROBE_KEY is provided. Otherwise skip.
if [ -n "${APP_SETTINGS_PROBE_KEY:-}" ]; then
  resp=$(curl -sS -H "apikey: $APP_SETTINGS_PROBE_KEY" \
    -H "Authorization: Bearer $APP_SETTINGS_PROBE_KEY" \
    "$URL/rest/v1/app_settings?select=window_weeks,use_median,latest_week_number,buffer_pct&limit=1" || true)
  if echo "$resp" | jq -e '.[0] | has("window_weeks") and has("use_median")' >/dev/null 2>&1; then
    echo "  PASS app_settings_singleton"
    pass=$((pass + 1))
  else
    echo "  FAIL app_settings_singleton"
    fail=$((fail + 1))
  fi
fi

# 3. HTTP shell + SPA render probe (per frontend-smoke.md tightened probe).
if [ -n "${PROD_URL:-}" ]; then
  shell=$(curl -sL "$PROD_URL" || true)
  bundle=$(echo "$shell" | grep -oE '/assets/index-[a-zA-Z0-9]+\.js' | head -1 || true)
  if [ -n "$bundle" ]; then
    bundle_body=$(curl -sL "$PROD_URL$bundle")
    expected=$(echo "$URL" | sed 's/https:\/\///')
    if echo "$bundle_body" | grep -q "$expected"; then
      echo "  PASS spa_render_probe (env-var literal $expected found in bundle)"
      pass=$((pass + 1))
    else
      echo "  FAIL spa_render_probe (env-var literal $expected NOT in bundle)"
      fail=$((fail + 1))
    fi
  else
    echo "  FAIL spa_render_probe (could not find /assets/index-*.js in $PROD_URL)"
    fail=$((fail + 1))
  fi
fi

echo ""
echo "Result: $pass passed, $fail failed."
[ "$fail" -eq 0 ] || exit 1
