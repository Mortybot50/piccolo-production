# Sentry — source-map upload setup

`@sentry/react` runtime error capture is wired into the SPA (PR #1, merged
28/05/2026). This file documents the **operator-side** step to enable
readable (symbolicated) stack traces in the Sentry dashboard.

Without this, every error in production surfaces as minified gibberish like
`aB.xY:1234`. Useless for debugging real café-side issues from the Hawthorn /
South Yarra crew.

## Vercel build-time env vars

Set the following three env vars on the `piccolo-prod-app` Vercel project,
`production` environment, **before** the next production deploy:

| Name | Value | Where to obtain |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | Organisation-scoped auth token | Sentry → User settings → Auth Tokens → "Create New Token" with `project:releases` + `org:read` scopes |
| `SENTRY_ORG` | `morty-bot` | Sentry → Settings → Organisation Settings → "Slug" |
| `SENTRY_PROJECT` | `piccolo-production` | Sentry → Projects → piccolo-production (note: the Sentry project slug is `piccolo-production`, NOT `piccolo-prod-app` which is the Vercel slug) |

CLI flow:

```bash
# Auth token — interactive prompt so the secret never lands in shell history.
# Vercel CLI will prompt; paste the sntrys_... value when asked.
vercel env add SENTRY_AUTH_TOKEN production

# Org + project slugs — not secrets, safe to pass via echo:
echo -n "morty-bot"           | vercel env add SENTRY_ORG       production
echo -n "piccolo-production"  | vercel env add SENTRY_PROJECT   production

vercel --prod   # rebuild so the next bundle uploads sourcemaps
```

**Why interactive for the auth token:** `echo -n "<token>" | vercel env add` writes
the literal token into your shell history (`~/.zsh_history` / `~/.bash_history`),
where it lives until manually scrubbed. The interactive prompt asks Vercel to read
from a TTY directly — the token never touches history.

## How the wiring works

`vite.config.ts` detects the three env vars at build time. If any is missing,
the `@sentry/vite-plugin` is skipped AND `build.sourcemap` stays `false` —
local `vite build` still works, just without source maps. When all three are
present:

1. Vite emits `*.map` files alongside the JS bundle.
2. The Sentry plugin uploads the maps to the Sentry org, tagged with the
   commit SHA.
3. The plugin then **deletes the maps from the artefact** (via
   `filesToDeleteAfterUpload`) before Vercel ships it — so they live only
   in Sentry, never on the public CDN.

The map-emission and map-deletion are gated by the same `sentryEnabled`
boolean, so it's impossible to ship public maps without simultaneously
uploading them to Sentry. Rollback (see below) flips both off together.

## Verification

After the first production deploy with all three env vars set:

1. From the deployed app's devtools console: `throw new Error('sentry-test')`.
2. In Sentry → piccolo-production → Issues, the event should show a
   fully-resolved stack with `src/...` filenames and line numbers — not
   `assets/index-abc.js:1`.
3. Check Sentry → Releases shows the commit SHA tag matching merged HEAD.
4. Confirm `.map` files are NOT publicly served:
   `curl -sI <prod-url>/assets/index-<hash>.js.map` should NOT return
   `content-type: application/json` (a 200 with `text/html` is the SPA
   fallback — expected, file doesn't exist).

## Rollback

If something goes wrong with source-map upload (Sentry rate-limits, auth
token expires), the runtime SDK keeps working. To temporarily disable upload
without re-deploying:

```bash
vercel env rm SENTRY_AUTH_TOKEN production
vercel --prod
```

The next bundle will skip the plugin AND skip source-map emission — errors
still get captured, just with minified frames until the token is restored.
