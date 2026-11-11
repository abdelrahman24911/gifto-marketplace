import Link from "next/link";

import { Breadcrumb } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";

import { SuggestionReview } from "./suggestion-review";
import { TagControls } from "./tag-controls";
import { TagForm } from "./tag-form";

export const metadata = { title: "Tags - Admin - Gifto" };

type TagRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
};

type LinkRow = { tag_id: string };

type SuggestionRow = {
  id: string;
  name: string;
  description: string | null;
  vendor_id: string;
  created_at: string;
};

export default async function AdminTagsPage() {
  const { supabase } = await requirePlatformAdmin();

  const [tagResult, productTagResult, occasionTagResult, suggestionResult] =
    await Promise.all([
      fetchAllRows<TagRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("tags")
          .select("id, name, slug, description, is_active")
          .order("is_active", { ascending: false })
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data, error };
      }),
      fetchAllRows<LinkRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("product_tags")
          .select("tag_id")
          .order("product_id", { ascending: true })
          .order("tag_id", { ascending: true })
          .range(from, to);
        return { data, error };
      }),
      fetchAllRows<LinkRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("occasion_tags")
          .select("tag_id")
          .order("occasion_id", { ascending: true })
          .order("tag_id", { ascending: true })
          .range(from, to);
        return { data, error };
      }),
      fetchAllRows<SuggestionRow>(async (from, to) => {
        const { data, error } = await supabase
          .from("tag_suggestions")
          .select("id, name, description, vendor_id, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data, error };
      }),
    ]);

  if (tagResult.failed) throw new Error("Could not load the tag vocabulary.");

  const tags = tagResult.rows;
  const suggestions = suggestionResult.rows;
  const vendorIds = [...new Set(suggestions.map((row) => row.vendor_id))];
  let vendorNames = new Map<string, string>();

  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, name")
      .in("id", vendorIds);
    vendorNames = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));
  }

  const productCounts = new Map<string, number>();
  for (const link of productTagResult.rows) {
    productCounts.set(link.tag_id, (productCounts.get(link.tag_id) ?? 0) + 1);
  }

  const occasionCounts = new Map<string, number>();
  for (const link of occasionTagResult.rows) {
    occasionCounts.set(link.tag_id, (occasionCounts.get(link.tag_id) ?? 0) + 1);
  }

  const activeTags = tags.filter((tag) => tag.is_active);
  const inactiveTags = tags.filter((tag) => !tag.is_active);
  const usageIncomplete = productTagResult.failed || occasionTagResult.failed;
  const usageTruncated = productTagResult.truncated || occasionTagResult.truncated;

  const rows = tags.map((tag) => ({
    ...tag,
    productCount: productCounts.get(tag.id) ?? 0,
    occasionCount: occasionCounts.get(tag.id) ?? 0,
  }));
  const activeRows = rows.filter((tag) => tag.is_active);
  const inactiveRows = rows.filter((tag) => !tag.is_active);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Tags" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
            Shared vocabulary
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none text-ink sm:text-5xl">
            Tags
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Approve the terms behind occasion matching. Vendors can apply these
            tags to their products and suggest new ones for review.
          </p>
        </div>
        <Link
          href="/admin/occasions"
          className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
        >
          Manage occasion rules
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active tags" value={activeTags.length} />
        <Stat label="Inactive tags" value={inactiveTags.length} />
        <Stat label="Pending suggestions" value={suggestions.length} />
        <Stat
          label="Tag assignments"
          value={
            usageIncomplete || usageTruncated
              ? "Incomplete"
              : productTagResult.rows.length.toLocaleString("en-US")
          }
        />
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section aria-labelledby="suggestion-queue-title">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2
                  id="suggestion-queue-title"
                  className="font-display text-3xl text-ink"
                >
                  Suggestion queue
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Vendor proposals stay private until an admin approves them.
                </p>
              </div>
              <span className="rounded-full border border-line-strong bg-paper-soft px-3 py-1 text-xs font-semibold text-ink-soft">
                {suggestions.length} waiting
              </span>
            </div>

            {suggestionResult.failed ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                The suggestion queue could not be loaded. Refresh to try again.
              </p>
            ) : suggestions.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper-soft px-4 py-6 text-center text-sm text-ink-mute">
                No vendor suggestions are waiting for review.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {suggestions.map((suggestion) => (
                  <SuggestionReview
                    key={suggestion.id}
                    suggestionId={suggestion.id}
                    name={suggestion.name}
                    description={suggestion.description}
                    vendorName={vendorNames.get(suggestion.vendor_id) ?? null}
                    createdAt={suggestion.created_at}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="vocabulary-title" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2
                  id="vocabulary-title"
                  className="font-display text-3xl text-ink"
                >
                  Tag vocabulary
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Renaming a tag keeps its public URL stable. Deactivation keeps
                  existing assignments but removes the tag from matching.
                </p>
              </div>
              <span className="rounded-full border border-line-strong bg-paper-soft px-3 py-1 text-xs font-semibold text-ink-soft">
                {tags.length} total
              </span>
            </div>

            {usageIncomplete ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                Usage counts could not be loaded completely. Tag actions still
                work, but the assignment totals may be low.
              </p>
            ) : usageTruncated ? (
              <p
                role="note"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                Usage totals reached the safety cap and may be incomplete.
              </p>
            ) : null}

            {activeRows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper-soft px-4 py-6 text-center text-sm text-ink-mute">
                No active tags yet. Create the first term to start matching
                products to occasions.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {activeRows.map((tag) => (
                  <TagControls key={tag.id} tag={tag} />
                ))}
              </ul>
            )}

            {inactiveRows.length > 0 ? (
              <>
                <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-mute">
                  Inactive ({inactiveRows.length})
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {inactiveRows.map((tag) => (
                    <TagControls key={tag.id} tag={tag} />
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </div>

        <aside>
          <div className="lg:sticky lg:top-6">
            <h2 className="font-display text-3xl text-ink">Create a tag</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              New tags are active immediately. Use a short, shopper-friendly
              term such as “Thoughtful” or “Housewarming”.
            </p>
            <div className="mt-4">
              <TagForm />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-mute">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-2xl text-ink">{value}</dd>
    </div>
  );
}
