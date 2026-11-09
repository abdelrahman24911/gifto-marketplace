import { describe, expect, it } from "vitest";

import {
  orderShopNames,
  orderShopsLabel,
  toOrderVendorProfileMap,
  vendorIdsFromOrderVendors,
} from "@/lib/order-vendors";

describe("order vendor lookups", () => {
  it("collects one id per shop for a multi-vendor order", () => {
    expect(
      vendorIdsFromOrderVendors([
        { vendor_id: "vendor-a" },
        { vendor_id: "vendor-b" },
        { vendor_id: "vendor-a" },
      ]),
    ).toEqual(["vendor-a", "vendor-b"]);
  });

  it("labels a valid vendor and keeps multiple shops in order", () => {
    const profiles = toOrderVendorProfileMap([
      { id: "vendor-a", name: "Nile Blossoms", slug: "nile-blossoms" },
      { id: "vendor-b", name: "Cairo Candles", slug: "cairo-candles" },
    ]);

    expect(
      orderShopsLabel(
        [{ vendor_id: "vendor-a" }, { vendor_id: "vendor-b" }],
        profiles,
      ),
    ).toBe(" · Nile Blossoms, Cairo Candles");
  });

  it("deduplicates repeated shop names without losing suborder order", () => {
    const profiles = toOrderVendorProfileMap([
      { id: "vendor-a", name: "Nile Blossoms", slug: "nile-blossoms" },
    ]);

    expect(
      orderShopNames(
        [
          { vendor_id: "vendor-a" },
          { vendor_id: "vendor-a" },
          { vendor_id: "missing" },
        ],
        profiles,
      ),
    ).toEqual(["Nile Blossoms"]);
  });

  it("returns an empty label when the vendor cannot be resolved", () => {
    expect(
      orderShopsLabel([{ vendor_id: "deleted-vendor" }], new Map()),
    ).toBe("");
  });

  it("never exposes fields outside the safe profile shape", () => {
    const profiles = toOrderVendorProfileMap([
      {
        id: "vendor-a",
        name: "Nile Blossoms",
        slug: "nile-blossoms",
        commission_rate: 0.15,
        contact_email: "private@example.com",
      } as never,
    ]);

    expect(profiles.get("vendor-a")).toEqual({
      id: "vendor-a",
      name: "Nile Blossoms",
      slug: "nile-blossoms",
    });
  });
});
