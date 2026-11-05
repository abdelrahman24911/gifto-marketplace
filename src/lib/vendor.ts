import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth";

import type { VendorRole, VendorStatus } from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof getRequestContext>>["supabase"];

export type VendorAccess = {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorStatus: VendorStatus;
  role: VendorRole;
};

export type VendorSession = {
  supabase: ServerClient;
  user: { id: string; email?: string };
  access: VendorAccess;
  shops: VendorAccess[];
  /** Write access to products, mirroring the catalog RLS policies. */
  canManage: boolean;
  isPlatformAdmin: boolean;
};

/**
 * Resolves which of the caller's shops the request is acting on.
 *
 * The vendor id is only ever taken from the caller's own memberships (verified
 * by RLS), never from client input, so a user cannot act on a shop they do not
 * belong to. `preferredVendorId` merely picks between shops they already own.
 */
export async function requireVendorRole(
  preferredVendorId?: string | null,
): Promise<VendorSession> {
  const { supabase, user, memberships, isPlatformAdmin } =
    await getRequestContext();

  if (!user) redirect("/login");

  const shops: VendorAccess[] = memberships
    .flatMap((m) =>
      m.vendor
        ? [
            {
              vendorId: m.vendor.id,
              vendorName: m.vendor.name,
              vendorSlug: m.vendor.slug,
              vendorStatus: m.vendor.status,
              role: m.role,
            },
          ]
        : [],
    )
    .filter((shop) => shop.vendorStatus === "active");

  if (shops.length === 0) redirect("/account");

  const access =
    shops.find((s) => s.vendorId === preferredVendorId) ?? shops[0];

  const canManage =
    access.role === "owner" || access.role === "manager" || isPlatformAdmin;

  return { supabase, user, access, shops, canManage, isPlatformAdmin };
}
