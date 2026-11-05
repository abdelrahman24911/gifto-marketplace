import { requireVendorRole } from "@/lib/vendor";

import { VendorShell } from "./vendor-shell";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { shops, isPlatformAdmin } = await requireVendorRole();

  return (
    <VendorShell shops={shops} isPlatformAdmin={isPlatformAdmin}>
      {children}
    </VendorShell>
  );
}
