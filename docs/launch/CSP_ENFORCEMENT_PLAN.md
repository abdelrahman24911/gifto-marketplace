# CSP enforcement plan

## Current posture

`next.config.ts` sends `Content-Security-Policy-Report-Only` for every route. It is deliberately report-only: it collects violations without blocking navigation, auth, or checkout.

Current policy:

```text
default-src 'self'
base-uri 'self'
object-src 'none'
frame-ancestors 'none'
frame-src 'none'
form-action 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' <supabase-origin>
font-src 'self'
connect-src 'self' <supabase-origin>
```

There are no third-party analytics, advertising, embeds, media providers, or payment scripts. Fonts are self-hosted by `next/font`. Supabase is the only remote origin, for browser Auth calls and public Storage images. The app has no `next/script`, no `dangerouslySetInnerHTML`, and no custom inline scripts.

`'unsafe-inline'` in `script-src` is required today for Next.js bootstrap scripts. `'unsafe-inline'` in `style-src` is required by dynamic inline style attributes in `src/components/bar-chart.tsx` (bar heights and minimum chart width). Development also reports `'unsafe-eval'` violations from the dev toolchain; that is expected and must not be copied into a production policy.

## Why not enforce immediately

Enforcing the current string would either block the application or provide little security value:

- Removing `'unsafe-inline'` from scripts without a nonce breaks Next.js hydration and client navigation.
- Removing `'unsafe-inline'` from styles breaks the analytics bars.
- A nonce must be generated per request, which cannot be done by the static header in `next.config.ts`; it needs request-scoped middleware/proxy headers.
- There is no report endpoint, so report-only violations currently appear only in browser consoles.

## Staged plan

### Stage 0: collect reliable reports (report-only)

1. Add a small authenticated-or-rate-limited report endpoint, for example `POST /api/csp-report`, that accepts `application/csp-report` / `application/reports+json` and logs a bounded, redacted event. Never log cookies, tokens, query strings, or request bodies.
2. Add `report-to` and `report-uri` directives to the report-only policy, plus a `Reporting-Endpoints` header. Keep the policy report-only.
3. Exercise the full app: public catalogue, search, Gift Finder, product detail, cart, login/signup, account, vendor, admin, checkout, order confirmation, 404, theme/reduced-motion, and keyboard navigation.
4. Classify every report as expected framework behavior, a real inline source, or a browser extension/test artifact. Do not add a source to the allowlist just to silence a report.

### Stage 1: nonce scripts, enforce script-src

1. Generate a cryptographically random nonce per request in `src/proxy.ts`.
2. Return the nonce-bearing policy on the response and pass the nonce to the request via a header (for example `x-nonce`) so the root layout and framework-emitted scripts can use it.
3. Set `script-src 'self' 'nonce-<value>' 'strict-dynamic'` only after confirming Next.js applies the nonce to its own scripts. Keep `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'`.
4. Run the complete browser matrix in report-only first; promote to enforcing only when the report stream is clean for a full release cycle.
5. Do not use `'unsafe-eval'` in production. Re-test dev separately if local tooling needs it.

### Stage 2: styles

1. Keep `style-src 'self' 'unsafe-inline'` while charts use React inline style attributes.
2. To remove it later, refactor chart sizing to a small, bounded set of generated classes or CSS custom properties that do not require arbitrary inline style attributes. Do not rely on hashes for values that change every render.
3. Re-test admin and vendor analytics at all chart sizes, including empty and single-point datasets.

### Stage 3: full enforcement and retirement

1. Enforce `default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `form-action`, `object-src`, `base-uri`, `frame-ancestors`, and `frame-src`.
2. Keep `connect-src` limited to self plus the configured Supabase origin. If realtime or hosted auth changes, update the source explicitly rather than adding a wildcard.
3. Keep `img-src` limited to self plus the project’s public Storage origin and path. Add `data:` only if a verified component requires it; current components use generated URLs or CSS artwork.
4. Document rollback: switch the response header back to `*-Report-Only` and redeploy. Do not weaken unrelated security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) during rollback.

## Test matrix

| Area | What must still work |
| --- | --- |
| Public pages | Home, occasions, categories, shops, product detail, search, Gift Finder |
| Auth | Login, signup, callback, sign-out, session refresh, protected-route redirects |
| Account | Orders list/detail, guest order cookie flow |
| Vendor | Overview, products, inventory, orders, analytics, finance, settings, support |
| Admin | Orders, products, shops, occasions, categories, tags, commissions, settlements, support, analytics |
| Commerce | Cart, checkout validation, COD placement, confirmation |
| UI | Inline chart sizing, reduced motion, navigation guard, mobile dialog |
| Failure paths | 404, unavailable catalogue, failed API, CSP violation reporting |

## Guardrails

- Report-only is the default until a clean full-matrix pass.
- No analytics or marketing origins are assumed; add a source only for a documented product requirement.
- Supabase origins come from environment configuration, never hardcoded.
- A CSP change is a security change: record the policy, test date, browser versions, and reviewer in the launch report.
