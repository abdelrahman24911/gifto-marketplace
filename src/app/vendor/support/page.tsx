import Link from "next/link";

import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { SUPPORT_FAQS } from "@/lib/support-content";
import {
  SUPPORT_STATUS_LABELS,
  supportCategoryLabel,
} from "@/lib/support-requests";
import { requireVendorRole } from "@/lib/vendor";

import { VendorPageHeader } from "../ui";
import { SupportFaqSearch } from "./support-faq";
import { SupportRequestForm } from "./support-request-form";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Help & support — Gifto" };

const STATUS_STYLES: Record<SupportRequestStatus, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-800",
  in_progress: "border-sky-200 bg-sky-50 text-sky-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export default async function VendorSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);

  const { data: recentRequests } = await supabase
    .from("support_requests")
    .select("id, category, subject, status, admin_reply, replied_at, created_at")
    .eq("vendor_id", access.vendorId)
    .order("created_at", { ascending: false })
    .limit(5);

  const quickLinks = [
    {
      href: `/vendor/orders?vendor=${access.vendorId}`,
      label: "Orders",
      detail: "Confirm, ship, deliver, cancel and restock.",
    },
    {
      href: `/vendor/products?vendor=${access.vendorId}`,
      label: "Products",
      detail: "Listings, visibility and photo requirements.",
    },
    {
      href: `/vendor/inventory?vendor=${access.vendorId}`,
      label: "Inventory",
      detail: "Stock levels, movements and low-stock alerts.",
    },
    {
      href: `/vendor/finance?vendor=${access.vendorId}`,
      label: "Finance",
      detail: "Commission, settlements and reversals.",
    },
    {
      href: `/vendor/analytics?vendor=${access.vendorId}`,
      label: "Analytics",
      detail: "Revenue definitions, best sellers and stock risk.",
    },
    {
      href: `/vendor/settings?vendor=${access.vendorId}`,
      label: "Store settings",
      detail: "Public details, hours, lead time, logo and cover.",
    },
  ];

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Help centre"
        title="Help & support"
        description={
          <>
            Answers for running {access.vendorName} on Gifto. Every guide below
            describes what this dashboard actually does.
          </>
        }
      />

      <nav
        aria-label="Help topics"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-line bg-paper-soft px-4 py-3 transition-colors hover:border-berry/40 hover:bg-berry-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            <span className="block text-sm font-medium text-ink">
              {link.label}
            </span>
            <span className="mt-0.5 block text-xs text-ink-mute">
              {link.detail}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="answers-heading"
          className="rounded-2xl border border-line bg-paper-soft p-5"
        >
          <h2 id="answers-heading" className="font-display text-lg text-ink">
            Browse answers
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Search or filter by topic. These are the same rules the dashboard
            enforces.
          </p>
          <div className="mt-5">
            <SupportFaqSearch faqs={SUPPORT_FAQS} />
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <section
            aria-labelledby="contact-heading"
            className="rounded-2xl border border-line bg-paper-soft p-5"
          >
            <h2 id="contact-heading" className="font-display text-lg text-ink">
              Still stuck?
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              Send a request to the Gifto team. It goes into the admin support
              queue for manual review.
            </p>
            <SupportRequestForm vendorId={access.vendorId} />
            <p className="mt-3 text-xs text-ink-mute">
              When email is configured, the shop&apos;s contact email receives
              an update when the status changes. Until then, no email is sent
              — check back here for the status.
            </p>
          </section>

          {recentRequests && recentRequests.length > 0 ? (
            <section
              aria-labelledby="requests-heading"
              className="rounded-2xl border border-line bg-paper-soft p-5"
            >
              <h2
                id="requests-heading"
                className="font-display text-lg text-ink"
              >
                Recent requests
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {recentRequests.map((request) => (
                  <li
                    key={request.id}
                    className="rounded-xl border border-line bg-paper px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink">
                        {request.subject}
                      </p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide ${STATUS_STYLES[request.status]}`}
                      >
                        {SUPPORT_STATUS_LABELS[request.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-mute">
                      {supportCategoryLabel(request.category)} ·{" "}
                      {new Date(request.created_at).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: BUSINESS_TIME_ZONE,
                        },
                      )}
                    </p>
                    {request.admin_reply ? (
                      <div className="mt-2 rounded-lg border border-line bg-paper-soft px-3 py-2">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-mute">
                          Gifto replied
                          {request.replied_at
                            ? ` · ${new Date(request.replied_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                timeZone: BUSINESS_TIME_ZONE,
                              })}`
                            : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-soft">
                          {request.admin_reply}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="checklist-heading"
            className="rounded-2xl border border-line bg-paper p-5"
          >
            <h2
              id="checklist-heading"
              className="font-display text-lg text-ink"
            >
              Before you ask
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
              <li>
                Check{" "}
                <Link
                  href={`/vendor/orders?vendor=${access.vendorId}`}
                  className="font-medium text-berry hover:text-berry-deep"
                >
                  Orders
                </Link>{" "}
                for the current shop-line status.
              </li>
              <li>
                Check{" "}
                <Link
                  href={`/vendor/finance?vendor=${access.vendorId}`}
                  className="font-medium text-berry hover:text-berry-deep"
                >
                  Finance
                </Link>{" "}
                for commission and settlement state.
              </li>
              <li>
                Check{" "}
                <Link
                  href={`/vendor/analytics?vendor=${access.vendorId}`}
                  className="font-medium text-berry hover:text-berry-deep"
                >
                  Analytics
                </Link>{" "}
                for delivered-only revenue definitions.
              </li>
              <li>
                Check the{" "}
                <Link
                  href="/account"
                  className="font-medium text-berry hover:text-berry-deep"
                >
                  Account page
                </Link>{" "}
                if your shop is pending, suspended or rejected.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
