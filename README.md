# Piccolo Production

Production and wholesale operations app for **Piccolo Panini Bar's enterprise / production division**. Replaces a 15-sheet Excel workbook with a phone-first PWA covering morning prep, store orders, supplier orders, café invoicing, and margin dashboards.

> Sibling project: [`ppb-ops-hub`](../ppb-ops-hub) is the cafe-side ops app for the same owner. **Separate Supabase project, separate codebase, separate scope.** No cross-imports.

## Stack

- **Frontend** — Vite 5 + React 19 + TypeScript (strict) + SWC
- **Styling** — Tailwind CSS v4 + shadcn-style primitives
- **Routing** — `react-router-dom` v6
- **State** — TanStack React Query + React Hook Form + Zod
- **Backend** — Supabase (Postgres + Auth + RLS + Edge Functions, Sydney region)
- **Auth** — Custom PIN flow via `pin-login` / `pin-change` Edge Functions
- **Deployment** — Vercel (auto-deploy on push to `main`)

## Quick start

```bash
cp .env.example .env.local      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                     # http://localhost:5173
```

## Environment variables

| Var | Required | Where |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | `.env.local` + Vercel project env |
| `VITE_SUPABASE_ANON_KEY` | yes | `.env.local` + Vercel project env |
| `VITE_APP_ENV` | optional | `production` / `development` |

## Build & deploy

```bash
npm run build                   # tsc -b && vite build -> dist/
```

Production deploys automatically on push to `main` via Vercel.

## Supabase

```bash
supabase link --project-ref qjplbovvadtfkmtjxplf
supabase functions deploy pin-login --no-verify-jwt
supabase functions deploy pin-change
npm run gen:types               # regenerate src/types/database.ts
```

Apply DB migrations via the Supabase MCP or `supabase db push`.

## Phase status

Phase A (foundation + PIN auth + first deploy) shipped 17/05/2026. Subsequent phases:

| Phase | Scope |
|---|---|
| B | DB schema (recipes, prep_items, prep_log, audit_log) |
| C | Settings (transfer prices, portions, batch sizes, buffer %) |
| D | Sales input ritual (paste Square weekly matrix) |
| E | Today screen (morning prep flow) |
| F | Store + catering orders |
| G | Supplier orders |
| H | Invoicing (screen, PDF, copy-paste-to-Xero) |
| I | Dashboard + margin alerts |
| J | QA + canary + hardening |

Full plan: `~/.openclaw/roles/dev/clients/piccolo-prod-app/plans/piccolo-prod-app-plan.md`.

## Repo conventions

- Commit author: `mortybot50@gmail.com` (Vercel seat-block).
- Conventional commits.
- Direct push to `main` allowed for solo founder workflow — Codex review gate runs before any `vercel --prod` ship per `~/.claude/rules/dev/codex-review.md`.

## License

MIT — see [LICENSE](./LICENSE).
