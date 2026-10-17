# Gifto Marketplace

Multi-vendor gift marketplace connecting gift shops across Egypt. Alexandria focus for initial operations.

Separate product and infrastructure from FL Tase3 (single-vendor store). This repository never reuses FL Tase3 code, credentials, database, or business logic.

## Tech Stack

- Next.js App Router, React, TypeScript (strict)
- Tailwind CSS
- Supabase (Auth, Postgres, Row Level Security, Storage)
- ESLint

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in Gifto Supabase values
npm run dev
```

### Environment variables (names only)

| Name | Exposed to browser | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Gifto Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Server-only. Never expose or commit. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site URL (auth redirects). |

Never commit `.env*`. Only variable *names* belong in `.env.example`.

## Scripts

```bash
npm run dev       # local dev server
npm run build     # production build (webpack; --webpack works everywhere)
npm run build:turbo  # production build via Turbopack (needs native SWC bindings)
npm run lint      # eslint
```

On win32/x64 this machine cannot load the native SWC bindings, so Turbopack builds
fail and `build` is pinned to `--webpack`.

Type check: `npx tsc --noEmit` (TypeScript strict mode).

## Database / Migrations

All schema changes live in version-controlled SQL under `supabase/migrations/`.

```bash
supabase link --project-ref <gifto-project-ref>
supabase db push          # applies pending migrations to the linked Gifto project
supabase migration list   # verify applied migrations
```

Only ever apply migrations to the **Gifto** project. Do not link or push to the FL Tase3 project.

### Verifying RLS locally

`supabase/tests/rls_foundation_test.sql` exercises the Phase 1 policies against a
disposable `supabase/postgres` container (which already ships the `auth` schema,
`auth.users`, `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles).
It simulates Supabase request context the way PostgREST does and aborts non-zero on
any failure. Each test sets both `request.jwt.claim.sub` and `request.jwt.claims`.

```bash
docker run -d --name gifto-rls-test -e POSTGRES_PASSWORD=postgres \
  -p 65432:5432 public.ecr.aws/supabase/postgres:17.6.1.106
# wait until ready, then:
docker exec gifto-rls-test psql -U postgres -c \
  'drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated;'
docker cp supabase/migrations/00000000000001_gifto_foundations.sql gifto-rls-test:/tmp/migration.sql
docker cp supabase/tests/rls_foundation_test.sql gifto-rls-test:/tmp/rls_test.sql
docker exec gifto-rls-test psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/migration.sql
docker exec gifto-rls-test psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/rls_test.sql
docker rm -f gifto-rls-test
```


### Phase 1 schema (implemented)

- `profiles` — linked to `auth.users`; single privilege flag `is_platform_admin`.
- `vendors` — store identity: name, slug, description, `logo_path` (Storage path only),
  `status` (`pending` | `active` | `suspended` | `rejected`), city/governorate,
  `delivery_coverage` (jsonb), `commission_rate`, timestamps.
- `vendor_members` — profile ↔ vendor membership with role (`owner` | `manager` | `staff`).
- `vendor_status_history` — audit trail of vendor status transitions.
- Committed-privilege helpers (`is_platform_admin`, `is_vendor_member/owner/manager/staff`),
  `SECURITY DEFINER` with pinned `search_path` and restricted `EXECUTE` grants.
- A trigger that prevents ordinary users from granting themselves platform-admin.
- A trigger that stops vendor owners from changing `status`/`commission_rate`
  (platform-admin-only fields).

`supabase/config.toml` uses non-default local ports (64320–64329, inspector 8183) so a
local Gifto stack can run alongside other Supabase projects on the same machine.

### Status semantics (defined now, checkout enforced later)

- `pending` — submitted, awaiting review; not public.
- `active` — approved and selling; publicly visible.
- `suspended` — blocked by admin; not public; **must be blocked from checkout** once
  checkout is implemented (Phase 4/5). Defined here, enforced there.
- `rejected` — declined; not public.

## Architecture notes (planned — not yet implemented)

The following are documented for direction only; no tables are created for them in Phase 1:

- **Catalog**: `products` (with `vendor_id`), `categories`, images (Storage paths), tags, options.
- **Checkout**: parent `orders` + `order_vendors` (per-vendor suborders) + `order_items`,
  created atomically in a single `SECURITY DEFINER` RPC. Vendors share one checkout but
  fulfill independently. Availability/stock re-validated server-side with row locks.
- **Inventory**: `inventory_movements`, stock enforced in the checkout RPC.
- **Money**: `commission_entries` (rate snapshotted at order time; `pending` → `earned`
  on qualifying status; reversed on cancel/return), `settlements` + `settlement_lines`.
- **Subscriptions (optional)**: `subscription_plans`, `vendor_subscriptions`, entitlements
  checked server-side; kept separate from per-order commission.

## Security model

- RLS is the authorization boundary — UI hiding is never relied on.
- A vendor cannot read or mutate another vendor's private data.
- Ordinary users cannot self-assign platform-admin; vendor owners cannot grant platform-admin;
  users cannot create memberships for vendors they do not control.
- Privileged `SECURITY DEFINER` functions pin `search_path` and restrict `EXECUTE`.
