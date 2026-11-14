import { DashboardShell } from "@/components/dashboard/dashboard-shell";

import type { VendorAccess } from "@/lib/vendor";
import type { ReactNode } from "react";

import { vendorNavGroups } from "./nav";

export function VendorShell({
  shops,
  isPlatformAdmin,
  email,
  children,
}: {
  shops: VendorAccess[];
  isPlatformAdmin: boolean;
  email?: string;
  children: ReactNode;
}) {
  const dashboardShops = shops.map((shop) => ({
    id: shop.vendorId,
    name: shop.vendorName,
    slug: shop.vendorSlug,
    role: shop.role,
  }));

  return (
    <DashboardShell
      variant="vendor"
      navGroups={vendorNavGroups}
      user={{ email, roleLabel: dashboardShops[0]?.role ?? "Shop team" }}
      brandHref="/vendor/overview"
      storefrontHref="/"
      isPlatformAdmin={isPlatformAdmin}
      shops={dashboardShops}
    >
      {children}
    </DashboardShell>
  );
}
