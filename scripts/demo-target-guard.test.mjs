/**
 * Regression tests for scripts/demo-target-guard.mjs (P5 demo separation).
 *
 * The guard is what stops a demo seed/cleanup from ever running against
 * the wrong database. Run with:
 *   node --test scripts/demo-target-guard.test.mjs
 * (Vitest does not pick this up — it only includes src/**\/*.test.ts.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  KNOWN_PRODUCTION_PROJECT_REFS,
  assertDemoTarget,
  demoTargetFromEnv,
  projectRefFromUrl,
} from "./demo-target-guard.mjs";

const DEMO_URL = "https://demo-ref-123.supabase.co";
const PRODUCTION_URL = `https://${KNOWN_PRODUCTION_PROJECT_REFS[0]}.supabase.co`;

test("projectRefFromUrl extracts the ref from a Supabase URL only", () => {
  assert.equal(projectRefFromUrl(DEMO_URL), "demo-ref-123");
  assert.equal(projectRefFromUrl(PRODUCTION_URL), KNOWN_PRODUCTION_PROJECT_REFS[0]);
  assert.equal(projectRefFromUrl("https://demo.example.com"), null);
  assert.equal(projectRefFromUrl("http://127.0.0.1:54321"), null);
  assert.equal(projectRefFromUrl("not a url"), null);
});

test("a demo environment with a non-production target passes", () => {
  assertDemoTarget({ url: DEMO_URL, environment: "demo" });
  assertDemoTarget({
    url: "http://127.0.0.1:54321",
    environment: "demo",
  });
});

test("an unset or non-demo environment refuses", () => {
  assert.throws(
    () => assertDemoTarget({ url: DEMO_URL, environment: undefined }),
    /GIFTO_ENVIRONMENT=demo/,
  );
  assert.throws(
    () => assertDemoTarget({ url: DEMO_URL, environment: "production" }),
    /GIFTO_ENVIRONMENT=demo/,
  );
  assert.throws(
    () => assertDemoTarget({ url: DEMO_URL, environment: "development" }),
    /GIFTO_ENVIRONMENT=demo/,
  );
});

test("a missing or invalid URL refuses", () => {
  assert.throws(
    () => assertDemoTarget({ url: undefined, environment: "demo" }),
    /NEXT_PUBLIC_SUPABASE_URL is missing/,
  );
  assert.throws(
    () => assertDemoTarget({ url: "not a url", environment: "demo" }),
    /not a valid URL/,
  );
});

test("a non-localhost http target refuses", () => {
  assert.throws(
    () =>
      assertDemoTarget({
        url: "http://demo.example.com",
        environment: "demo",
      }),
    /must use https/,
  );
});

test("the known production project refuses without an explicit opt-in", () => {
  assert.throws(
    () => assertDemoTarget({ url: PRODUCTION_URL, environment: "demo" }),
    /is the production Supabase project/,
  );
  assert.throws(
    () => assertDemoTarget({ url: PRODUCTION_URL, environment: "demo" }),
    /GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT=true/,
  );
});

test("the known production project passes with the explicit opt-in", () => {
  assertDemoTarget({
    url: PRODUCTION_URL,
    environment: "demo",
    allowProductionProject: true,
  });
});

test("a custom production-ref list is respected", () => {
  assert.throws(
    () =>
      assertDemoTarget({
        url: "https://other-prod-ref.supabase.co",
        environment: "demo",
        productionRefs: ["other-prod-ref"],
      }),
    /is the production Supabase project/,
  );
  assertDemoTarget({
    url: "https://other-prod-ref.supabase.co",
    environment: "demo",
    productionRefs: ["someone-elses-ref"],
  });
});

test("demoTargetFromEnv reads the guard inputs from env names", () => {
  const target = demoTargetFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: DEMO_URL,
    GIFTO_ENVIRONMENT: "demo",
    GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT: "true",
    GIFTO_PRODUCTION_PROJECT_REFS: "ref-one, ref-two ",
  });
  assert.deepEqual(target, {
    url: DEMO_URL,
    environment: "demo",
    allowProductionProject: true,
    productionRefs: ["ref-one", "ref-two"],
  });

  const minimal = demoTargetFromEnv({
    NEXT_PUBLIC_SUPABASE_URL: DEMO_URL,
    GIFTO_ENVIRONMENT: "demo",
  });
  assert.equal(minimal.allowProductionProject, false);
  assert.equal(minimal.productionRefs, undefined);
});
