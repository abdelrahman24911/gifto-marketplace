import "server-only";

import {
  toOrderVendorProfileMap,
  vendorIdsFromOrderVendors,
  type OrderVendorProfileMap,
  type OrderVendorReference,
} from "@/lib/order-vendors";
import { createServiceClient } from "@/lib/supabase/service";

const EMPTY_PROFILES: OrderVendorProfileMap = new Map();

/**
 * Loads only the public shop fields needed to label an order.
 *
 * The caller must first fetch the order through the session-scoped client so
 * RLS has already proven that the signed-in user owns it (or is a platform
 * admin). This lookup deliberately bypasses RLS only for `id, name, slug`:
 * migration 20 removed customer reads from the base `vendors` table, while the
 * public view hides inactive shops that may still own historical orders.
 *
 * A lookup failure must not hide the order itself; callers fall back to their
 * generic "Shop" label when the map is empty.
 */
export async function loadOrderVendorProfiles(
  suborders: ReadonlyArray<OrderVendorReference>,
): Promise<OrderVendorProfileMap> {
  const vendorIds = vendorIdsFromOrderVendors(suborders);
  if (vendorIds.length === 0) return EMPTY_PROFILES;

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("vendors")
      .select("id, name, slug")
      .in("id", vendorIds);

    if (error) return EMPTY_PROFILES;
    return toOrderVendorProfileMap(data ?? []);
  } catch {
    return EMPTY_PROFILES;
  }
}
