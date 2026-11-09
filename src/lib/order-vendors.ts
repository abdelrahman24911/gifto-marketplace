export type OrderVendorProfile = {
  id: string;
  name: string;
  slug: string;
};

export type OrderVendorProfileMap = ReadonlyMap<string, OrderVendorProfile>;

export type OrderVendorReference = {
  vendor_id: string;
};

/**
 * Collects the distinct vendor ids referenced by a set of order lines.
 *
 * `order_vendors.vendor_id` is non-null and protected by a foreign key, but
 * callers still receive a deduplicated list so one vendor lookup serves every
 * line in a multi-shop order.
 */
export function vendorIdsFromOrderVendors(
  suborders: ReadonlyArray<OrderVendorReference>,
): string[] {
  return [...new Set(suborders.map((suborder) => suborder.vendor_id))];
}

export function toOrderVendorProfileMap(
  profiles: ReadonlyArray<OrderVendorProfile>,
): OrderVendorProfileMap {
  return new Map(
    profiles.map((profile) => [
      profile.id,
      { id: profile.id, name: profile.name, slug: profile.slug },
    ]),
  );
}

/**
 * Customer-facing shop names for an order. The vendor rows are loaded through
 * the service-only lookup after RLS has scoped the order to the caller; this
 * helper only formats the result and never performs a data read.
 */
export function orderShopNames(
  suborders: ReadonlyArray<OrderVendorReference>,
  profiles: OrderVendorProfileMap,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const suborder of suborders) {
    const profile = profiles.get(suborder.vendor_id);
    if (!profile || seen.has(profile.name)) continue;
    seen.add(profile.name);
    names.push(profile.name);
  }

  return names;
}

export function orderShopsLabel(
  suborders: ReadonlyArray<OrderVendorReference>,
  profiles: OrderVendorProfileMap,
): string {
  const names = orderShopNames(suborders, profiles);
  return names.length > 0 ? ` · ${names.join(", ")}` : "";
}
