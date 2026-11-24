import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * P0 demo containment (migration 67) — application-side helpers.
 *
 * The database (_create_order) is the authority: it rejects any demo
 * vendor's order transactionally. These helpers only give the storefront
 * and server actions the same answer early, with the same paused wording,
 * so a customer never fills in a checkout that must refuse them, and a
 * demo shop owner cannot quietly resume orders from vendor settings.
 *
 * Every helper fails OPEN (returns "not blocked" / null) when the setting
 * cannot be read: before migration 67 is applied the app_settings table
 * does not exist, and the pre-67 behaviour (no containment) is the status
 * quo. A broken settings read must never block a real vendor. The
 * database check is what makes containment real; these helpers are UX.
 */

export const DEMO_ORDERS_ALLOWED_KEY = "demo_orders_allowed";

/**
 * Reads app_settings.demo_orders_allowed via the service client.
 * Returns null when the setting is unknown — table missing (pre-67),
 * no service key configured, or the read failed.
 */
export async function demoOrdersAllowed(): Promise<boolean | null> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("app_settings")
      .select("value")
      .eq("key", DEMO_ORDERS_ALLOWED_KEY)
      .maybeSingle();

    if (error || !data) return null;
    return data.value === true;
  } catch {
    return null;
  }
}

/**
 * Pure rule, shared by every call site: a demo vendor is blocked only
 * when containment is positively ON (allowed === false). An unknown
 * setting (null) never blocks.
 */
export function isDemoVendorBlocked(
  isDemo: boolean,
  allowed: boolean | null,
): boolean {
  return isDemo && allowed === false;
}

/** Pure: the accepting state the UI should show for a vendor. */
export function effectiveAcceptingOrders(
  isAcceptingOrders: boolean,
  isDemo: boolean,
  allowed: boolean | null,
): boolean {
  return isAcceptingOrders && !isDemoVendorBlocked(isDemo, allowed);
}

/**
 * Service-role check for one vendor: blocked only when the vendor is
 * demo-flagged AND containment is on. False on any read error.
 */
export async function isVendorBlockedFromOrders(
  vendorId: string,
): Promise<boolean> {
  try {
    const allowed = await demoOrdersAllowed();
    if (allowed !== false) return false;

    const service = createServiceClient();
    const { data, error } = await service
      .from("vendors")
      .select("is_demo")
      .eq("id", vendorId)
      .maybeSingle();

    if (error || !data) return false;
    return data.is_demo === true;
  } catch {
    return false;
  }
}

type DemoVendorRow = {
  id: string;
  name: string;
  is_demo: boolean;
};

/**
 * Checkout pre-check (mirrors the demo-vendor containment branch in the
 * checkout action): the first demo vendor in the cart whose orders are
 * contained, or null when nothing is blocked / the check cannot run. Uses
 * the exact paused wording the database raises, so the customer sees one
 * message either way.
 */
export async function demoVendorOrderError(
  items: unknown,
): Promise<string | null> {
  if (!Array.isArray(items) || items.length === 0) return null;

  const productIds = [
    ...new Set(
      items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = (item as { product_id?: unknown }).product_id;
        return typeof value === "string" ? [value] : [];
      }),
    ),
  ];
  if (productIds.length === 0) return null;

  try {
    const allowed = await demoOrdersAllowed();
    if (allowed !== false) return null;

    const service = createServiceClient();
    const { data, error } = await service
      .from("products")
      .select("id, vendor:vendors!inner(id, name, is_demo)")
      .in("id", productIds)
      .returns<{ id: string; vendor: DemoVendorRow | DemoVendorRow[] | null }[]>();

    if (error || !data) return null;

    for (const row of data) {
      const vendor = Array.isArray(row.vendor) ? row.vendor[0] : row.vendor;
      if (vendor?.is_demo) {
        return `“${vendor.name}” is not accepting orders right now.`;
      }
    }
  } catch {
    // The database check inside _create_order is still authoritative.
    return null;
  }

  return null;
}
