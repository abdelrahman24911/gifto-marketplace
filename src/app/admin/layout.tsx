import { DashboardShell } from "@/components/dashboard/dashboard-shell";

import { requirePlatformAdmin } from "@/lib/auth";

import { adminNavGroups } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requirePlatformAdmin();

  return (
    <DashboardShell
      variant="admin"
      navGroups={adminNavGroups}
      user={{ email: user.email, roleLabel: "Platform admin" }}
      brandHref="/admin"
      storefrontHref="/"
    >
      {children}
    </DashboardShell>
  );
}
