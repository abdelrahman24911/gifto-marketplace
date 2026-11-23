import { describe, expect, it, vi } from "vitest";

// src/lib/demo-containment.ts is server-only; the guard package throws
// outside React Server Components, so it is stubbed here like the other
// server-only module tests (mail, price-consent-refusal).
vi.mock("server-only", () => ({}));

import {
  effectiveAcceptingOrders,
  isDemoVendorBlocked,
} from "@/lib/demo-containment";

/**
 * P0 demo containment (migration 67): the pure rules the storefront and
 * server actions share. The async helpers (service-client reads) are
 * covered by the RLS suite rls_demo_containment_test.sql; these unit
 * tests pin the decision table so a future refactor cannot silently
 * invert it.
 */
describe("isDemoVendorBlocked", () => {
  it("blocks a demo vendor only when containment is positively on", () => {
    expect(isDemoVendorBlocked(true, false)).toBe(true);
    expect(isDemoVendorBlocked(true, true)).toBe(false);
    // Unknown setting (pre-67 deploy, missing row, read error) never blocks.
    expect(isDemoVendorBlocked(true, null)).toBe(false);
  });

  it("never blocks a non-demo vendor", () => {
    expect(isDemoVendorBlocked(false, false)).toBe(false);
    expect(isDemoVendorBlocked(false, true)).toBe(false);
    expect(isDemoVendorBlocked(false, null)).toBe(false);
  });
});

describe("effectiveAcceptingOrders", () => {
  it("a demo vendor under containment shows as not accepting orders", () => {
    expect(effectiveAcceptingOrders(true, true, false)).toBe(false);
  });

  it("a demo vendor with the switch on (or unknown) keeps its own flag", () => {
    expect(effectiveAcceptingOrders(true, true, true)).toBe(true);
    expect(effectiveAcceptingOrders(true, true, null)).toBe(true);
    expect(effectiveAcceptingOrders(false, true, true)).toBe(false);
  });

  it("a non-demo vendor keeps its own flag under every setting", () => {
    expect(effectiveAcceptingOrders(true, false, false)).toBe(true);
    expect(effectiveAcceptingOrders(false, false, false)).toBe(false);
    expect(effectiveAcceptingOrders(true, false, null)).toBe(true);
  });
});
