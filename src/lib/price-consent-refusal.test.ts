import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// src/lib/price-consent-refusal.ts is server-only; the guard package
// throws outside React Server Components, so tests stub it out.
vi.mock("server-only", () => ({}));

// The service client is unavailable by default; tests install a
// recording fake that captures the recorder RPC call.
const serviceState = vi.hoisted(() => ({
  client: null as unknown,
  rpcError: null as unknown,
  throwOnCreate: false,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    if (serviceState.throwOnCreate) {
      throw new Error("service client is not available in unit tests");
    }
    if (!serviceState.client) {
      throw new Error("service client is not available in unit tests");
    }
    return serviceState.client;
  },
}));

import { recordPriceConsentRefusal } from "./price-consent-refusal";

type RpcCall = { name: string; args: Record<string, unknown> };

function makeServiceFake() {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpcCalls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (serviceState.rpcError) return { data: null, error: serviceState.rpcError };
      return { data: null, error: null };
    },
  };
  return client;
}

const ITEMS = [{ product_id: "11111111-1111-1111-1111-111111111111", quantity: 2 }];
const EXPECTED_PRICES = [
  { product_id: "11111111-1111-1111-1111-111111111111", unit_price_minor: 5000 },
];
// The checkout attempt's own idempotency key — the refusal row must key
// to the same attempt _create_order received (S-12).
const ATTEMPT_KEY = "22222222-2222-2222-2222-222222222222";

describe("recordPriceConsentRefusal", () => {
  beforeEach(() => {
    serviceState.client = null;
    serviceState.rpcError = null;
    serviceState.throwOnCreate = false;
  });

  afterEach(() => {
    serviceState.client = null;
    serviceState.rpcError = null;
    serviceState.throwOnCreate = false;
  });

  it("records a signed-in refusal with the attempt's own idempotency key and actor", async () => {
    const fake = makeServiceFake();
    serviceState.client = fake;
    await recordPriceConsentRefusal({
      items: ITEMS,
      expectedPrices: EXPECTED_PRICES,
      expectedTotalMinor: 10000,
      idempotencyKey: ATTEMPT_KEY,
      userId: "33333333-3333-3333-3333-333333333333",
      guestTokenHash: null,
    });
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toEqual({
      name: "_record_price_consent_refusal",
      args: {
        p_idempotency_key: ATTEMPT_KEY,
        p_items: ITEMS,
        p_user_id: "33333333-3333-3333-3333-333333333333",
        p_guest_token_hash: null,
        p_expected_prices: EXPECTED_PRICES,
        p_expected_total_minor: 10000,
      },
    });
  });

  it("records a guest refusal with the guest token hash and no user id", async () => {
    const fake = makeServiceFake();
    serviceState.client = fake;
    const guestHash = "a".repeat(64);
    await recordPriceConsentRefusal({
      items: ITEMS,
      expectedPrices: EXPECTED_PRICES,
      expectedTotalMinor: 10000,
      idempotencyKey: ATTEMPT_KEY,
      userId: null,
      guestTokenHash: guestHash,
    });
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_idempotency_key: ATTEMPT_KEY,
      p_user_id: null,
      p_guest_token_hash: guestHash,
    });
  });

  it("never throws when the recorder RPC reports an error", async () => {
    const fake = makeServiceFake();
    serviceState.client = fake;
    serviceState.rpcError = new Error("No price mismatch to record.");
    await expect(
      recordPriceConsentRefusal({
        items: ITEMS,
        expectedPrices: EXPECTED_PRICES,
        expectedTotalMinor: 10000,
        idempotencyKey: ATTEMPT_KEY,
        userId: null,
        guestTokenHash: "b".repeat(64),
      }),
    ).resolves.toBeUndefined();
    // The call was still attempted — only the error is swallowed.
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it("never throws when the service client is unavailable", async () => {
    serviceState.throwOnCreate = true;
    await expect(
      recordPriceConsentRefusal({
        items: ITEMS,
        expectedPrices: EXPECTED_PRICES,
        expectedTotalMinor: 10000,
        idempotencyKey: ATTEMPT_KEY,
        userId: "33333333-3333-3333-3333-333333333333",
        guestTokenHash: null,
      }),
    ).resolves.toBeUndefined();
  });
});
