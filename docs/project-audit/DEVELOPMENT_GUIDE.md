# Gifto Marketplace — Development Guide

**Audit date:** 2026-10-19  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Branch:** `main` @ commit `347eda9`  
**Confidence level:** High for setup commands; Medium for runtime verification (results documented, not re-executed during this audit)

---

## Safe Project Setup

### Prerequisites
- Node.js (version per `package.json` engines — check `.nvmrc` or `engines` field)
- npm (package manager — `package-lock.json` is committed; do not introduce a second package manager)
- Supabase CLI (for database operations — optional for code-only work)
- Docker (for local Postgres container — required for RLS test suites)

### Initial setup (read-only, no secrets)
```bash
# Clone the repository (if not already present)
git clone https://github.com/abdelrahman24911/gifto-marketplace.git
cd gifto-marketplace

### Environment variable names (values NOT included — never print or commit secrets)

| Variable | Exposed to browser | Purpose |
|----------|-------------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Gifto Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Server-only. Never expose to browser, never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site URL (auth redirects) |

**Security rules:**

---

## Available Scripts

| Script | Command | Purpose | Verified? |
|--------|---------|---------|-----------|
| `npm run dev` | `next dev` | Local dev server | Inspected (not run) |
| `npm run build` | `next build --webpack` | Production build (webpack; Turbopack fails on this machine) | Documented as passing |
| `npm run build:turbo` | `next build` | Turbopack build (fails on win32/x64 — no native SWC bindings) | Not usable locally |
| `npm run start` | `next start` | Production server | Inspected (not run) |
| `npm run lint` | `eslint` | ESLint linting | Documented as 0 errors, 0 warnings |

---

## Running the Application

### Local development
```bash
npm run dev
# Open http://localhost:3000
```

### Production build and start
```bash
npm run build      # Uses --webpack (Turbopack not supported locally)
npm run start      # Serve production build
```

---

## Running Tests

### Unit tests (Vitest)
```bash
npm test
# Runs src/**/*.test.ts in Node environment
# 4 test files: money.test.ts, cart.test.ts, cart-store.test.ts, slugify.test.ts
```

### Type check
```bash
npm run typecheck
# TypeScript strict mode, noEmit
```

### Lint
```bash
npm run lint
# ESLint with nextjs config
```

### RLS test suites (database)
The 7 SQL test suites require a disposable `supabase/postgres` container. Procedure documented in `README.md`:

```bash
# 1. Start a disposable Postgres container

---

## Database Setup and Migration Instructions

### Migration conventions
- All schema changes live in version-controlled SQL under `supabase/migrations/`
- Migrations are numbered sequentially: `00000000000001_<name>.sql` through `00000000000009_<name>.sql`
- Each migration is re-runnable where possible (`create extension if not exists`, `drop policy if exists`, `on conflict do nothing`)
- Migrations 1–7 are applied to the hosted Gifto project (`hqusykdyjpruysxezsrn`) and verified live
- Migrations 8–9 are container-verified but awaiting `supabase db push`

### Applying migrations to hosted project
```bash
supabase link --project-ref hqusykdyjpruysxezsrn
supabase db push          # applies pending migrations
supabase migration list   # verify applied migrations
```

**Security rules:**
- Only ever apply migrations to the Gifto project
- Never link or push to the FL Tase3 project
- Never reuse FL Tase3 credentials, database, or business logic
- `.env.local` contains real values — never commit or print it

---

## Architecture Conventions

### Server/client trust boundary
- All data reads/writes go through Server Components or Server Actions
- The cart lives in `localStorage` and is **never trusted** — `place_order` re-reads all prices and stock from the database
- Client-supplied prices, totals, and commission amounts are ignored
- Identity and roles derived from verified Supabase session only — never from client-submitted values

### Money handling
- All amounts stored as integer minor units (piastres)
- EGP has 2 decimal places
- `src/lib/money.ts`: `formatEgp()`, `parseEgpToMinor()`, `minorToEgpInput()`
- No floating-point arithmetic for financial calculations

### Validation
- No Zod or validation library currently in `package.json`
- Validation is done inline in Server Actions and database functions
- Database `CHECK` constraints enforce integrity (order totals, commission amounts, stock bounds)

### Error handling
- Server Actions return `{ error, ... }` or `{ success, ... }` states

---

## Coding and Testing Standards

### Code style
- TypeScript strict mode (`tsconfig.json`)
- Server Components preferred for reads; Server Actions for writes
- Client components marked `"use client"` only when needed (interactivity, cart)
- ESLint with `eslint-config-next` (core-web-vitals + typescript rules)

### Testing standards
- Unit tests live next to modules: `src/lib/*.test.ts`
- Vitest in Node environment (no browser, no database)
- RLS tests in `supabase/tests/` as SQL files (require Postgres container)
- Test data uses synthetic customer data only — never real PII
- `restoreMocks: true` in `vitest.config.ts`

### Git and change management

---

## Known Blockers

| Blocker | Impact | Workaround |
|---------|--------|------------|
| Turbopack builds fail on win32/x64 (no native SWC bindings) | `npm run build:turbo` unusable | Use `npm run build` (webpack) |
| `supabase start` doesn't produce containers locally | Can't run full local Supabase stack | Use raw `supabase/postgres` container for RLS tests |
| 3 commits ahead of origin (unpushed) | Work not backed up remotely | Push `main` to `origin/main` (GM-P0-001) |
| Migrations 8–9 not on hosted project | Hardening + image upload not live | Run `supabase db push` (GM-P0-002) |
| 5 high npm audit advisories unreviewed | Potential vulnerability | Review before `npm audit fix --force` (GM-P0-003) |
| D-06 and D-07 decisions pending | Cannot build delivery fees or subscriptions | Await owner approval (GM-P1-004, GM-P1-005) |

---

## Phase Execution Workflow

1. **Read the plan:** Review `docs/project-audit/PHASE_TASKS.md` for the current phase
2. **Check prerequisites:** Verify all dependency tasks are complete
3. **Check decisions:** Confirm any `BLOCKED_PENDING_OWNER_APPROVAL` decisions are resolved
4. **Implement:** Write code following the architecture conventions above
5. **Test:** Run `npm test`, `npm run typecheck`, `npm run lint`, and relevant RLS suites
6. **Review:** Inspect the diff before committing
7. **Commit:** Use conventional commit message format
8. **Repeat:** Move to the next task in priority order

---

## Verification Checks Actually Performed

The following checks were **inspected but not re-executed** during this audit (results taken from `STATUS_REPORT.md` and `README.md`):

| Check | Documented result | Verified by auditor? |
|-------|-------------------|---------------------|
| `npm run lint` | 0 errors, 0 warnings | No |
| `npm run typecheck` | clean | No |
| `npm test` | 31 passing, 4 files | No |
| `npm run build` | exit 0, 23 routes | No |
| RLS suites (7) | 107 assertions, all pass | No |
| Page smoke test | Public → 200; protected → 307 to login | No |
| Hosted end-to-end | place_order → deliver → ledger → rollback | No |

These should be re-executed before any production release.
- Commit messages follow convention: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `test: ...`
- Never force-push; never rewrite history
- Never push to FL Tase3 remote
- `.env*` files gitignored (except `.env.example`)
- `node_modules`, `.next`, `build`, `coverage`, `*.tsbuildinfo` gitignored
- Database functions raise exceptions with specific SQLSTATE codes (42501 for auth, 23514 for check violations, 22023 for invalid input)
- Client components display error/success messages from action state

### Route protection
- `src/proxy.ts` provides middleware-level route guards (convenience only)
- Every protected page also verifies the session server-side
- RLS enforces data access regardless of UI

### Generating TypeScript types
```bash
supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```
The current `database.types.ts` is hand-written and covers Phases 1–6. Regenerate from the live database when the Gifto project exists.
docker run -d --name gifto-rls-test -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 public.ecr.aws/supabase/postgres:17.11.0.003

# 2. Wait until ready, then apply migrations and tests
docker cp supabase/migrations/00000000000001_gifto_foundations.sql gifto-rls-test:/tmp/0001.sql
docker exec gifto-rls-test psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/0001.sql
# ... repeat for migrations 2–9 ...
docker cp supabase/tests/rls_foundation_test.sql gifto-rls-test:/tmp/rls_test.sql
docker exec gifto-rls-test psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/rls_test.sql
```

**Important:** `supabase start` does not produce containers on this machine. Use the raw `supabase/postgres:17.11.0.003` image. The older `17.6.1.106` tag crashes when a role is denied EXECUTE on a function.

**Storage tests:** Apply `supabase/tests/storage_stub.sql` first (the raw image has no storage schema).
| `npm test` | `vitest run` | Unit tests (Node env, 4 test files) | Documented as 31 passing |
| `npm run typecheck` | `tsc --noEmit` | TypeScript strict type check | Documented as clean |

**Note:** Script results above are documented in `STATUS_REPORT.md` and `README.md` (2026-10-19). They were not re-executed during this audit due to read-only constraints.
- Never commit `.env*` files (`.env.example` is the only tracked env file)
- Never print secret values in logs, docs, or chat
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — use only in server-side bootstrapping

# Install dependencies
npm install

# Copy environment template (fill in real values from Gifto Supabase dashboard)
cp .env.example .env.local
# NEVER commit .env.local — it is gitignored
```