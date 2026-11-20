import Link from "next/link";

import { requireVendorRole } from "@/lib/vendor";

import { VendorNotice, VendorPageHeader } from "../../ui";
import { StaffManagement, type StaffMember } from "./staff-management";

export const metadata = { title: "Shop staff — Gifto" };

/**
 * Shop staff (P1-14, H-07), under the vendor settings structure at
 * /vendor/settings/staff. The roster comes from the list_vendor_members RPC
 * (migration 41): profiles are self-read only, so the RPC is the only way
 * an owner can see the other members' contact details.
 */
export default async function VendorStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, user, isPlatformAdmin } =
    await requireVendorRole(vendor);

  const canManage = access.role === "owner" || isPlatformAdmin;

  const { data, error } = await supabase.rpc("list_vendor_members", {
    p_vendor_id: access.vendorId,
  });

  if (error) {
    return (
      <div className="w-full">
        <VendorPageHeader
          eyebrow="Shop staff"
          title="Staff"
          description={`Who can work on ${access.vendorName}.`}
        />
        <div className="mt-6">
          <VendorNotice tone="danger" role="alert">
            The staff list couldn&apos;t load.{" "}
            <Link
              href={`/vendor/settings/staff?vendor=${access.vendorId}`}
              className="font-medium text-berry hover:underline"
            >
              Try again
            </Link>
            .
          </VendorNotice>
        </div>
      </div>
    );
  }

  const members: StaffMember[] = (data ?? []).map((row) => ({
    profileId: row.profile_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
  }));

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Shop staff"
        title="Staff"
        description={
          <>
            Who can work on {access.vendorName}. Owners invite staff and
            change roles; managers and staff see this list read-only.
          </>
        }
        actions={
          <Link
            href={`/vendor/settings?vendor=${access.vendorId}`}
            className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            Back to store settings
          </Link>
        }
      />

      <div className="mt-6">
        <StaffManagement
          vendorId={access.vendorId}
          members={members}
          canManage={canManage}
          selfId={user.id}
        />
      </div>
    </div>
  );
}
