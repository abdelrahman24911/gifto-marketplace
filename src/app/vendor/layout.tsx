import { requireVendorRole } from "@/lib/vendor";

import { VendorShell } from "./vendor-shell";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { shops, isPlatformAdmin, user } = await requireVendorRole();

  return (
    <VendorShell
      shops={shops}
      isPlatformAdmin={isPlatformAdmin}
      email={user.email}
    >
      {children}
    </VendorShell>
  );
}
