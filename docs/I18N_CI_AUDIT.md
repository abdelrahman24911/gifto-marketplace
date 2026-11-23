# Gifto — i18n CI Audit

**Date:** 2026-11-24
**Branch:** `muse/decision-closure-brevo`
**Scope:** Verify that the i18n key guard is wired into CI and cannot silently
pass when translation files are missing.

## Findings

### CI wiring

`.github/workflows/ci.yml` runs the guard in the required `app` job:

```yaml
# .github/workflows/ci.yml:37-41
- run: npm run check:i18n
```

The `app` job also runs lint, typecheck, Vitest, and the production build
(`ci.yml:34-47`). The guard is not optional and does not depend on secrets or a
database.

### Script behaviour before this change

`scripts/check-i18n-keys.mjs`:

- read **only** `messages/en.json`;
- flattened its keys and checked every `t("key")` / `t.rich("key")` call in
  `src/` against that set;
- resolved the namespace from the translator binding
  (`const t = useTranslations("order")` /
  `const t = await getTranslations("order")`);
- exited 1 on a missing/wrong-namespace key.

The gap: if `messages/ar.json` was missing, the script never read it, so
`npm run check:i18n` **passed**. The app supports Arabic; a missing Arabic file
would have failed at runtime or fallen back silently, not in CI.

### Current key state

- `messages/en.json`: 648 flattened keys.
- `messages/ar.json`: 648 flattened keys.
- Key sets are identical; no missing or extra keys.
- `npm run check:i18n` reports **788 translator calls** across `src/`.

### Change made

`scripts/check-i18n-keys.mjs` now:

1. Loads both `messages/en.json` and `messages/ar.json`.
2. Fails with `MISSING LOCALE FILE: <path>` and exit 1 if either file is absent.
3. Fails with `INVALID LOCALE JSON: <path>` and exit 1 if either file is
   unreadable/invalid JSON.
4. Compares the flattened key sets and fails with
   `LOCALE KEY MISMATCH` listing keys missing in Arabic or present only in
   Arabic.
5. Keeps the original translator-call check against `messages/en.json`.
6. Prints the shared key count on success.

The CI comment was updated to say the guard now checks both locale files
(`.github/workflows/ci.yml:37-40`).

## Verification

### Normal run

```powershell
npm run check:i18n
```

Output:

```
OK — 788 translator calls, all keys present in messages/en.json; messages/en.json and messages/ar.json share 648 keys
```

Exit code: 0.

### Missing Arabic file

A disposable copy of the script, both locale files, and a minimal `src/` was
created under the temp directory. `messages/ar.json` was renamed, then the
script was run:

```
MISSING LOCALE FILE: messages/ar.json
```

Exit code: 1.

### Extra Arabic key

A temporary `__test_extra` key was added to the disposable Arabic file:

```
LOCALE KEY MISMATCH (messages/en.json vs messages/ar.json):
ONLY IN messages/ar.json:
__test_extra
```

Exit code: 1.

These tests were run against a disposable copy, not the repository files.

## Residual limitations

The guard is deliberately simple; it is not a full i18n validator.

- It only checks **literal** `t("key")` / `t.rich("key")` calls. Dynamic keys
  (for example `t(variable)`) are not resolved and therefore not checked.
- The namespace regex accepts only letters (`[a-zA-Z]+`), so a namespace with a
  dot, dash, or underscore would not be discovered.
- It checks key **presence**, not translation values, placeholders, plural
  forms, or ICU syntax.
- It checks only English and Arabic. Adding another locale requires extending
  the locale list and the parity comparison.
- It does not prove that every key is actually used; unused keys are allowed.

These are acceptable for the current two-locale pilot, but they should be
revisited if dynamic keys or more locales are added.

## Recommendation

- Keep `npm run check:i18n` as a required CI step.
- Keep both locale files in the parity check; do not relax it to English-only.
- If dynamic translation keys are introduced, add a runtime or type-level check
  rather than weakening this guard.
- Add a third locale to the same parity mechanism before shipping that locale.

## Evidence

- `.github/workflows/ci.yml:25-47` — `app` job and the guard step.
- `package.json:21` — `check:i18n` script.
- `scripts/check-i18n-keys.mjs` — enhanced guard.
- `messages/en.json`, `messages/ar.json` — 648 shared keys.
- Temp-directory runs: normal pass; missing Arabic file fails; extra Arabic key
  fails.
