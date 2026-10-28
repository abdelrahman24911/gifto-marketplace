import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";

import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Account — Gifto" };

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  suspended: "bg-red-50 text-red-800 border-red-200",
  rejected: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

const statusHelp: Record<string, string> = {
  pending: "Awaiting review by the platform team.",
  active: "Approved and publicly visible in the shop directory.",
  suspended: "Suspended by the platform team. Contact support for details.",
  rejected: "Application was declined.",
};

export default async function AccountPage() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("vendor_members")
      .select(
        "role, vendor:vendors(id, name, slug, status, city, governorate)",
      )
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const isPlatformAdmin = profile?.is_platform_admin ?? false;
  if (isPlatformAdmin) {
    redirect("/admin");
  }

  const shops = (memberships ?? []).filter(
    (m): m is typeof m & { vendor: NonNullable<typeof m.vendor> } =>
      Boolean(m.vendor),
  );

  // Only send vendors with eligible active memberships to the vendor dashboard.
  // Pending/suspended/rejected vendors must remain on the account page to see status.
  const eligibleActiveShops = shops.filter((s) => s.vendor.status === "active");
  if (eligibleActiveShops.length > 0) {
    const preferred = eligibleActiveShops[0];
    redirect(`/vendor/overview?vendor=${preferred.vendor.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Your account
      </h1>

      <nav className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/account/orders"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Your orders
        </Link>
        {shops.length > 0 ? (
          <Link
            href="/vendor/orders"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
          >
            Shop orders
          </Link>
        ) : null}
      </nav>

      <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Profile
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Name</dt>
            <dd className="text-zinc-900">
              {profile?.full_name || "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-zinc-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-zinc-900">{profile?.phone || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Role</dt>
            <dd className="text-zinc-900">
              {profile?.is_platform_admin
                ? "Platform administrator"
                : "Customer"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Your shops
        </h2>

        {shops.length === 0 ? (
          <div className="mt-4">
            <OnboardingForm />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {shops.map(({ role, vendor }) => (
              <li
                key={vendor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-zinc-900">{vendor.name}</p>
                  <p className="text-sm text-zinc-500">
                    Your role: {role}
                    {vendor.city ? ` · ${vendor.city}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {statusHelp[vendor.status]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/vendor/products?vendor=${vendor.id}`}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                  >
                    {role === "owner" || role === "manager"
                      ? "Manage products"
                      : "View products"}
                  </Link>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[vendor.status] ?? "bg-zinc-100 text-zinc-700 border-zinc-300"}`}
                  >
                    {vendor.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
