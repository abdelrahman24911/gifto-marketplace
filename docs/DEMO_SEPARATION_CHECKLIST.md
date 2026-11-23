# Demo Separation Checklist — isolated demo environment

How to move Gifto's demo data out of the production Supabase project
into its own isolated environment, and how to keep the two apart
afterwards. **Do not create any external project from this document
alone** — the Supabase project, the Vercel project, and the DNS/domain
steps need the owner's account access and explicit go-ahead. This
checklist is the preparation; the owner (or someone with his access)
performs the infrastructure steps.

## Why

Today the demo catalogue lives **inside the production project**
(`hqusykdyjpruysxezsrn`, 6 demo vendors, 36 demo products, 6
`@demo.gifto.example` owner accounts — see
`docs/DEMO_DATA_GUIDE.md`). That was the pre-separation setup, and it
has three live risks:

1. A demo script run in the wrong terminal seeds or wipes demo data
   in production (mitigated in code since Batch 4: the scripts now
   refuse unless `GIFTO_ENVIRONMENT=demo` — see "Code guards" below).
2. Demo vendors could take real orders in production (mitigated in
   code since Batch 1: migration 67, `app_settings.demo_orders_allowed`
   defaults to `false`, and `_create_order` rejects demo vendors
   transactionally).
3. A demo deployment with SMTP configured could email real customers
   (mitigated in code since Batch 4: the mail module refuses to send
   from a demo environment unless `GIFTO_DEMO_ALLOW_EMAIL=true`).

The code guards are the safety net. The isolated environment removes
the risk at the root: demo data stops sharing a database, a Storage
bucket, and an auth user pool with production entirely.

## What the code already guarantees (no infrastructure needed)

- **Environment identity** — `src/lib/environment.ts` parses
  `GIFTO_ENVIRONMENT` (`production` / `staging` / `demo` /
  `development`, default `development`, unknown values throw).
  The deployment preflight (`npm run preflight:deploy`) fails on an
  unknown value and warns when it is unset.
- **Demo scripts are fail-closed** — `scripts/demo-target-guard.mjs`
  (`node --test scripts/demo-target-guard.test.mjs`, 9 tests).
  `seed:demo`, `cleanup:demo`, `demo:passwords` and `demo:reset`
  refuse unless `GIFTO_ENVIRONMENT=demo`, the target uses https
  (http only for localhost), and the target is not a known production
  project ref unless `GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT=true` is
  set explicitly. Until the isolated environment exists, that opt-in
  is how the owner keeps seeding the production project deliberately.
- **No real email from demo** — `src/lib/mail.ts` refuses every send
  (and every outbox retry run) with `skipped: "demo-environment"`
  when `GIFTO_ENVIRONMENT=demo`, unless `GIFTO_DEMO_ALLOW_EMAIL=true`.
  The admin retry action reports the refusal instead of a misleading
  success. (Demo accounts use `@demo.gifto.example` addresses, which
  cannot receive mail anyway.)
- **No demo orders in production** — migration 67
  (`app_settings.demo_orders_allowed`, default `false`) plus the
  `_create_order` rejection, the checkout pre-check, and the
  demo-owner resume refusal (`src/lib/demo-containment.ts`).
- **Visible labelling** — the root layout renders an amber "Demo
  environment — demo data only" banner (sky for staging) on every
  page when `GIFTO_ENVIRONMENT` is `demo` or `staging`. It never
  renders on production.
- **Storage and roles are already scoped** — the seeder writes product
  images only under `product-images/{demo_vendor_id}/{product_id}/…`
  and creates owner memberships only on demo vendors; cleanup removes
  only demo-vendor folders, `is_demo` rows, and `@demo.gifto.example`
  auth users. A dedicated demo bucket was evaluated and **not** built:
  it would need image-URL resolution changes for demo products, and
  the vendor-folder prefix plus the `is_demo` flag already separates
  demo objects from real ones. Revisit only if a real vendor's images
  ever share a demo vendor's folder (they cannot — folders are keyed
  by vendor id).

## What a real payout is (and is not)

Gifto never moves money inside the app. A settlement payout is an
external bank transfer that an admin attests to in the app with
`mark_settlement_paid` (migration 25/36: transfer reference + proof
required; "paid" means a genuine, verified payout). There is therefore
no code switch that "blocks payouts" in demo — the boundary is that
**a demo environment must never contain real vendor bank details or
real settlements**. The checklist below enforces that by keeping the
databases separate; the C1 correction package
(`supabase/corrections/`, rehearsed, never executed against
production) is the only sanctioned way to fix the two synthetic paid
settlements that already exist in production, and it needs the owner's
explicit go-ahead first.

## Setup checklist (owner steps)

### 1. New Supabase project (demo)

- [ ] Create a new Supabase project (same region as production,
      `eu-central-1`, so latency and behaviour match). Name it
      unmistakably, e.g. `gifto-demo`.
- [ ] Record its project ref and URL in the deployment notes — never
      in the repo. Add the ref to `GIFTO_PRODUCTION_PROJECT_REFS`
      only if it ever becomes a production project (it must not).
- [ ] Apply migrations **1–70 in order** (`npx supabase db push` or
      the dashboard SQL editor, in order). Verify with
      `select count(*) from supabase_migrations.schema_migrations`
      — expect 70 rows — and confirm `app_settings` contains
      `demo_orders_allowed = false`.
- [ ] Create the three image buckets with the same limits as
      production (migrations 09/21/26): `product-images`,
      `vendor-media`, `occasion-images` — public, 5 MB limit,
      JPEG/PNG/WebP (+ AVIF for product-images and vendor-media).
- [ ] Do **not** copy production data into the demo project. No real
      vendors, products, orders, customers, or settlements. The demo
      project starts empty and is seeded from scratch (step 3).

### 2. New Vercel project (demo)

- [ ] Create a separate Vercel project from the same repo/branch
      (or the demo branch the owner chooses). Give it a demo-only
      domain — never the production domain.
- [ ] Set its environment variables (names only here — values from
      the demo project's dashboard):
      - `NEXT_PUBLIC_SUPABASE_URL` = demo project URL
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = demo anon key
      - `SUPABASE_SERVICE_ROLE_KEY` = demo service key
      - `GIFTO_ENVIRONMENT=demo` (**required** — without it the app
        defaults to `development`, the banner does not render, and
        the demo scripts refuse to run)
      - `NEXT_PUBLIC_SITE_URL` = the demo deployment's public URL
      - `NEXT_PUBLIC_SEO_INDEXING=false` (demo must never be indexed)
      - Leave all `SMTP_*` / `MAIL_FROM` **unset** unless test sends
        are needed; if they are, set `GIFTO_DEMO_ALLOW_EMAIL=true`
        as well and use a test mailbox, never a real customer list.
      - Sentry DSN: use the demo project's DSN if monitoring is
        wanted, never the production DSN.
- [ ] Deploy, then run `npm run preflight:deploy` against the demo
      target and confirm it passes (buckets + `GIFTO_ENVIRONMENT`
      checks included).

### 3. Seed the demo catalogue

- [ ] From a terminal with the demo project's `.env.local`
      (`NEXT_PUBLIC_SUPABASE_URL` = demo URL, service key = demo
      key, `GIFTO_ENVIRONMENT=demo`), run:
      ```bash
      npm run seed:demo
      ```
      The guard refuses if the environment or the target is wrong.
      Expect 6 vendors / 36 products.
- [ ] Run `npm run demo:passwords` to rotate and reveal the demo
      owner credentials (treat the output as a secret; every run
      invalidates the previous passwords).
- [ ] Verify in the demo deployment: the amber demo banner is visible
      on every page; the storefront lists the 5 active demo vendors;
      a checkout from a demo vendor is refused with the paused
      wording while `demo_orders_allowed` is `false`; the vendor
      dashboard signs in as a demo owner.

### 4. Decide the demo-orders switch

- [ ] The demo environment is for showing the catalogue and the
      dashboards, not for taking orders — leave
      `demo_orders_allowed = false` (the default). If a demo ever
      needs a full checkout walkthrough, set it to `true` in the
      **demo project's** `app_settings` only, for that session, and
      set it back to `false` afterwards. Never set it to `true` in
      production.

## Ongoing rules

- **Never point a demo script at production without the explicit
  opt-in.** `GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT=true` exists only
  for the pre-separation setup; once the isolated environment is
  live, stop using it — and remove the production ref from any
  operator's notes that suggest it.
- **Reset, don't hand-edit.** To refresh the demo catalogue, run
  `npm run demo:reset` (cleanup + seed under the same guard), then
  `npm run demo:passwords`. Never hand-delete demo rows in the
  production project.
- **No real data in demo, no demo data in production.** Demo vendors
  are `is_demo = true` by construction; a real vendor is never
  flagged demo, and a demo vendor is never unflagged. Orders placed
  in the demo environment are test orders and must never be settled
  or paid.
- **Rotate demo passwords after every vendor visit** (they are
  printed in a terminal and shared in person), and run
  `npm run cleanup:demo` when a demo environment is retired.

## Retiring the production demo data

Once the isolated environment is live and the owner confirms the
demo works there, the demo rows in production should be removed —
they are the reason the production project still needs the
`GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT` escape hatch:

1. [ ] Confirm the four intentional demo/test orders are preserved
      until the isolated environment and cleanup process are ready
      (owner decision, 2026-11-23) — do not delete orders.
2. [ ] Decide the C1 correction for the two synthetic paid
      settlements (`supabase/corrections/`): execute only with the
      owner's explicit go-ahead, rehearsed first
      (`scripts/rehearse-c1.sh`).
3. [ ] Run `npm run cleanup:demo` against the production project
      with the explicit opt-in (it removes demo vendors, products,
      images and `@demo.gifto.example` accounts; it never touches
      categories, real rows, orders, commissions or settlements).
4. [ ] Verify with the read-only count query in
      `docs/DEMO_DATA_GUIDE.md`: `demo_vendors = 0`,
      `demo_products = 0`, `demo_accounts = 0`.
5. [ ] After cleanup, the production project contains no demo data;
      the guard's production-ref blocklist then protects it
      permanently, and the opt-in should never be used again.
