import Link from "next/link";

import { Breadcrumb } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { type OccasionFormValues } from "@/lib/occasions";

import { OccasionForm } from "../occasion-form";

export const metadata = { title: "New occasion — Admin — Gifto" };

const INITIAL_VALUES: OccasionFormValues = {
  name: "",
  slug: "",
  description: "",
  imageAlt: "",
  matchMode: "hybrid",
  isActive: false,
};

export default async function NewOccasionPage() {
  await requirePlatformAdmin();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { href: "/admin/occasions", label: "Occasions" },
          { label: "New occasion" },
        ]}
      />

      <div className="mt-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
          New catalog surface
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none text-ink sm:text-5xl">
          Create an occasion
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Name the moment clearly, add one strong image, and leave it hidden
          until it is ready. The planned public address is generated from the
          name and can be refined before or after you publish.
        </p>
      </div>

      <OccasionForm
        mode="create"
        initialValues={INITIAL_VALUES}
        initialImagePath={null}
      />

      <p className="mt-6 text-center text-sm text-ink-mute">
        <Link
          href="/admin/occasions"
          className="font-medium text-berry hover:underline"
        >
          Back to all occasions
        </Link>
      </p>
    </div>
  );
}
