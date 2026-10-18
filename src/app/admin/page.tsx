import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/auth";

import { CategoryForm } from "./category-form";
import { VendorControls } from "./vendor-controls";

import type { VendorStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Admin — Gifto" };

const STATUS_ORDER: VendorStatus[] = [
  "pending",
  "active",
  "suspended",
  "rejected",
];

export default async function AdminPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, slug, status, commission_rate, city, governorate, contact_email, contact_phone, created_at",
    )
    .order("created_at", { ascending: false });

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, position, is_active")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  const all = vendors ?? [];
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: all.filter((v) => v.status === status).length,
  }));

  const pending = all.filter((v) => v.status === "pending");
  const others = all.filter((v) => v.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Platform administration
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Review shop applications, approve shops, and configure commission rates.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          View all orders
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map(({ status, count }) => (
          <div
            key={status}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {status}
            </dt>
            <dd className="text-2xl font-semibold text-zinc-900">{count}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Pending review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
            No shop applications waiting for review.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
            {pending.map((vendor) => (
              <VendorControls key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          All shops ({others.length})
        </h2>
        {others.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
            No shops yet.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
            {others.map((vendor) => (
              <VendorControls key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900">
          Categories ({(categories ?? []).length})
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Categories are shared by every shop and drive the public catalog.
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            {(categories ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
                No categories yet.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100">
                {(categories ?? []).map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">
                        {category.name}
                      </p>
                      <p className="truncate text-sm text-zinc-500">
                        /{category.slug}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                        category.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-zinc-200 bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {category.is_active ? "active" : "hidden"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Add a category
            </h3>
            <div className="mt-3">
              <CategoryForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
