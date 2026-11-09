import Link from "next/link";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import {
  coverageFromJson,
  formatCoverageList,
  workingHoursFromJson,
} from "@/lib/vendor-settings";
import { requireVendorRole } from "@/lib/vendor";

import { BrandingUpload } from "./branding-upload";
import { PauseOrders } from "./pause-orders";
import { StoreSettingsForm } from "./store-settings-form";

export const metadata = { title: "Store settings — Gifto" };

export default async function VendorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, isPlatformAdmin } =
    await requireVendorRole(vendor);

  const { data: shop, error } = await supabase
    .from("vendors")
    .select(
      "id, name, slug, description, logo_path, cover_path, status, city, governorate, delivery_coverage, contact_phone, contact_email, address_line, working_hours, prep_time_min_days, prep_time_max_days, is_accepting_orders",
    )
    .eq("id", access.vendorId)
    .maybeSingle();

  const canEdit = access.role === "owner" || isPlatformAdmin;
  const roleDetail = canEdit ? "can edit" : "read-only";

  if (error || !shop) {
    return (
      <div className="w-full">
        <Breadcrumb
          items={[
            {
              href: `/vendor/overview?vendor=${access.vendorId}`,
              label: "Shop dashboard",
            },
            { label: "Store settings" },
          ]}
        />
        <div className="mt-6">
          <EmptyState title="Store settings couldn't load">
            The shop profile didn&apos;t respond.{" "}
            <Link
              href={`/vendor/settings?vendor=${access.vendorId}`}
              className="text-berry hover:underline"
            >
              Try again
            </Link>
            .
          </EmptyState>
        </div>
      </div>
    );
  }

  const coverage = coverageFromJson(shop.delivery_coverage);
  const workingHours = workingHoursFromJson(shop.working_hours);

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          {
            href: `/vendor/overview?vendor=${access.vendorId}`,
            label: "Shop dashboard",
          },
          { label: "Store settings" },
        ]}
      />

      <div className="mt-4">
        <h1 className="font-display text-2xl text-ink">Store settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          The public details customers see about {shop.name}. Changes go live on
          your shop page as soon as you save.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-ink-mute">
            Public URL
          </p>
          <Link
            href={`/shops/${shop.slug}`}
            className="mt-1 block truncate text-sm font-medium text-berry hover:text-berry-deep"
          >
            /shops/{shop.slug}
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-ink-mute">
            Shop status
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-ink">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide text-emerald-800">
              {shop.status}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-ink-mute">
            Your role
          </p>
          <p className="mt-1 text-sm font-medium capitalize text-ink">
            {access.role} · {roleDetail}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-mute">
        Shop status is controlled by the Gifto team. Contact support if your
        shop needs to be paused or reviewed.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="profile-heading"
          className="rounded-2xl border border-line bg-paper-soft p-5"
        >
          <h2 id="profile-heading" className="font-display text-lg text-ink">
            Store profile
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Contact and location details used by customers and the Gifto team.
          </p>
          <div className="mt-5">
            <StoreSettingsForm
              vendorId={access.vendorId}
              vendorSlug={shop.slug}
              canEdit={canEdit}
              initial={{
                name: shop.name,
                description: shop.description ?? "",
                contactPhone: shop.contact_phone ?? "",
                contactEmail: shop.contact_email ?? "",
                city: shop.city ?? "",
                governorate: shop.governorate ?? "",
                addressLine: shop.address_line ?? "",
                governorates: formatCoverageList(coverage.governorates),
                areas: formatCoverageList(coverage.areas),
                workingHours,
                prepTimeMinDays: shop.prep_time_min_days?.toString() ?? "",
                prepTimeMaxDays: shop.prep_time_max_days?.toString() ?? "",
              }}
            />
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <PauseOrders
            vendorId={access.vendorId}
            initialAccepting={shop.is_accepting_orders}
            canEdit={canEdit}
          />

          <BrandingUpload
            kind="logo"
            vendorId={access.vendorId}
            name={shop.name}
            path={shop.logo_path}
            canEdit={canEdit}
          />

          <BrandingUpload
            kind="cover"
            vendorId={access.vendorId}
            name={shop.name}
            path={shop.cover_path}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
