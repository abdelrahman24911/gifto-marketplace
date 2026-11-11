import Link from "next/link";

import { PlusIcon, SearchIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  OCCASION_MATCH_MODE_LABELS,
  filterOccasions,
  parseOccasionStatusFilter,
  type OccasionStatusFilter,
} from "@/lib/occasions";
import {
  OCCASION_IMAGES_BUCKET,
  type OccasionMatchMode,
} from "@/lib/supabase/database.types";

import { DeleteOccasionButton } from "./delete-occasion-button";
import { ReorderOccasionButtons } from "./reorder-buttons";
import { VisibilityButton } from "./visibility-button";

export const metadata = { title: "Occasions — Admin — Gifto" };

type OccasionListRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_path: string | null;
  image_alt: string | null;
  is_active: boolean;
  sort_order: number;
  match_mode: OccasionMatchMode;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<OccasionStatusFilter, string> = {
  all: "All",
  published: "Published",
  hidden: "Hidden",
};

function listHref(query: string, status: OccasionStatusFilter) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  const search = params.toString();
  return search ? `/admin/occasions?${search}` : "/admin/occasions";
}

function formatUpdated(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminOccasionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    deleted?: string;
    warning?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const query = (params.q ?? "").trim().slice(0, 80);
  const status = parseOccasionStatusFilter(params.status);

  const { rows, failed, truncated } = await fetchAllRows<OccasionListRow>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("occasions")
        .select(
          "id, name, slug, description, image_path, image_alt, is_active, sort_order, match_mode, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    },
  );

  const publishedCount = rows.filter((row) => row.is_active).length;
  const hiddenCount = rows.length - publishedCount;
  const visibleRows = filterOccasions(rows, query, status);
  const orderIndex = new Map(rows.map((row, index) => [row.id, index]));
  const filtersActive = Boolean(query) || status !== "all";
  const canReorder = !failed && !truncated && !filtersActive;
  const reorderHint =
    failed || truncated
      ? "Reordering is unavailable while the list cannot be read in full."
      : filtersActive
        ? "Clear search and filters to change the order."
        : "Move controls include hidden occasions so their place is kept.";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Occasions" },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
            Catalog surfaces
          </p>
          <h1 className="mt-2 font-display text-4xl leading-none text-ink sm:text-5xl">
            Occasions
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Curate the moments Gifto can build around and hand-pick the
            products each one should feature. Automatic matching rules come in
            the next phase.
          </p>
        </div>
        <Link
          href="/admin/occasions/new"
          className="inline-flex items-center gap-2 rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          <PlusIcon className="h-4 w-4" />
          New occasion
        </Link>
      </div>

      {params.deleted === "1" ? (
        <div
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Occasion deleted.
          {params.warning === "image" ? (
            <span className="mt-1 block text-amber-900">
              Its image may still be in Storage. Check the bucket if you need
              to remove it.
            </span>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
        {[
          ["Total", rows.length],
          ["Published", publishedCount],
          ["Hidden", hiddenCount],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-4 sm:px-5">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              {label}
            </dt>
            <dd className="mt-1 font-display text-2xl text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {failed || truncated ? (
        <p className="mt-2 px-1 text-xs text-ink-mute">
          Counts may be incomplete because the full list could not be read.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filter occasions by status" className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as OccasionStatusFilter[]).map(
            (filter) => {
              const active = status === filter;
              const count =
                filter === "all"
                  ? rows.length
                  : filter === "published"
                    ? publishedCount
                    : hiddenCount;

              return (
                <Link
                  key={filter}
                  href={listHref(query, filter)}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-ink bg-ink text-paper"
                      : "border-line-strong bg-paper-soft text-ink-soft hover:border-berry/40 hover:text-berry-deep"
                  }`}
                >
                  {STATUS_LABELS[filter]}
                  <span
                    className={`ml-1.5 text-xs ${
                      active ? "text-paper/65" : "text-ink-mute"
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              );
            },
          )}
        </nav>

        <form
          method="get"
          action="/admin/occasions"
          className="flex w-full max-w-md items-center gap-2"
        >
          {status !== "all" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search occasions by name</span>
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              maxLength={80}
              placeholder="Search by name"
              className="w-full rounded-full border border-line-strong bg-paper-soft py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-line-strong bg-paper-soft px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            Search
          </button>
          {filtersActive ? (
            <Link
              href="/admin/occasions"
              className="px-1 text-sm text-ink-mute hover:text-berry-deep"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {failed ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Occasions could not be loaded.{" "}
          <Link href="/admin/occasions" className="font-medium underline">
            Refresh the page
          </Link>{" "}
          to try again.
        </p>
      ) : null}

      {truncated ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          There are too many occasions to display reliably. Counts and
          reordering are disabled until the list is reduced.
        </p>
      ) : null}

      {!failed ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-mute">
          <p>
            {filtersActive
              ? `${visibleRows.length} of ${rows.length} occasions`
              : `${rows.length} occasion${rows.length === 1 ? "" : "s"}`}
          </p>
          <p>{reorderHint}</p>
        </div>
      ) : null}

      {!failed && visibleRows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={filtersActive ? "No occasions match" : "No occasions yet"}
          >
            {filtersActive ? (
              <>
                Try a different name or{" "}
                <Link
                  href="/admin/occasions"
                  className="font-medium text-berry hover:underline"
                >
                  clear the filters
                </Link>
                .
              </>
            ) : (
              <>
                Start with one clear moment, then add an image and publish it
                when it is ready.{" "}
                <Link
                  href="/admin/occasions/new"
                  className="font-medium text-berry hover:underline"
                >
                  Create the first occasion
                </Link>
                .
              </>
            )}
          </EmptyState>
        </div>
      ) : null}

      {!failed && visibleRows.length > 0 ? (
        <ul className="mt-6 overflow-hidden rounded-2xl border border-line bg-paper-soft">
          {visibleRows.map((occasion) => {
            const fullIndex = orderIndex.get(occasion.id) ?? -1;
            const isFirst = fullIndex <= 0;
            const isLast = fullIndex === rows.length - 1;

            return (
              <li
                key={occasion.id}
                className="grid gap-4 border-b border-line p-4 last:border-b-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:p-5 lg:grid-cols-[7rem_minmax(0,1fr)_auto]"
              >
                <ProductImage
                  path={occasion.image_path}
                  alt={occasion.image_alt || occasion.name}
                  name={occasion.name}
                  bucket={OCCASION_IMAGES_BUCKET}
                  className="h-28 w-full"
                  rounded="rounded-xl"
                  sizes="(min-width: 1024px) 112px, 100vw"
                />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-lg font-medium text-ink">
                      {occasion.name}
                    </h2>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                        occasion.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-line-strong bg-paper text-ink-mute"
                      }`}
                    >
                      {occasion.is_active ? "Published" : "Hidden"}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-ink-mute">
                    /occasions/{occasion.slug}
                  </p>
                  <p className="mt-2 line-clamp-2 max-w-2xl break-words text-sm leading-relaxed text-ink-soft">
                    {occasion.description ||
                      "No description yet. Add one so this occasion carries its own point of view."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
                    <span>
                      {OCCASION_MATCH_MODE_LABELS[occasion.match_mode]} matching
                    </span>
                    <span>Position {fullIndex + 1}</span>
                    <span>Updated {formatUpdated(occasion.updated_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-2 sm:col-span-2 lg:col-span-1 lg:max-w-56 lg:justify-end">
                  {canReorder ? (
                    <ReorderOccasionButtons
                      occasionId={occasion.id}
                      occasionName={occasion.name}
                      isFirst={isFirst}
                      isLast={isLast}
                    />
                  ) : null}
                  <VisibilityButton
                    occasionId={occasion.id}
                    occasionName={occasion.name}
                    isActive={occasion.is_active}
                  />
                  <Link
                    href={`/admin/occasions/${occasion.id}/edit`}
                    aria-label={`Edit ${occasion.name}`}
                    className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
                  >
                    Edit
                  </Link>
                  <DeleteOccasionButton
                    occasionId={occasion.id}
                    occasionName={occasion.name}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
