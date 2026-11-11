"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { ProductImage } from "@/components/product-image";
import { useUnsavedChangesGuard } from "@/components/navigation-guard";
import { formatEgp } from "@/lib/money";
import {
  PRODUCT_PICKER_MAX_SELECTION,
  PRODUCT_PICKER_SORT_LABELS,
  PRODUCT_PICKER_SORTS,
  PRODUCT_PICKER_STATUS_FILTERS,
  PRODUCT_PICKER_STATUS_LABELS,
  addProductToSelection,
  isProductSelectionDirty,
  moveProductInSelection,
  parseProductPickerQuery,
  productAvailabilityNote,
  removeProductFromSelection,
  type ProductPickerCategoryOption,
  type ProductPickerItem,
  type ProductPickerQuery,
  type ProductPickerSort,
  type ProductPickerStatusFilter,
} from "@/lib/occasion-products";
import { totalPages } from "@/lib/pagination";
import type {
  OccasionMatchMode,
  ProductStatus,
} from "@/lib/supabase/database.types";

import { loadProductPickerPageAction, saveOccasionProducts } from "./actions";

type PickerPageData = {
  items: ProductPickerItem[];
  total: number;
  page: number;
  pageSize: number;
};

type FilterDraft = {
  productQuery: string;
  vendorQuery: string;
  categoryId: string;
  status: ProductPickerStatusFilter;
  sort: ProductPickerSort;
};

const EMPTY_QUERY: ProductPickerQuery = {
  productQuery: "",
  vendorQuery: "",
  categoryId: null,
  status: "all",
  sort: "newest",
  page: 1,
};

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-mute transition-colors focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass = "flex flex-col gap-1.5 text-xs font-medium text-ink";
const secondaryButtonClass =
  "rounded-full border border-line-strong bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_STYLES: Record<ProductStatus, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-line-strong bg-paper-deep text-ink-soft",
};

export function ProductPicker({
  occasionId,
  initialSelected,
  categories,
  initialPage,
  matchMode,
}: {
  occasionId: string;
  initialSelected: ProductPickerItem[];
  categories: ProductPickerCategoryOption[];
  initialPage: PickerPageData;
  matchMode: OccasionMatchMode;
}) {
  const titleId = useId();
  const availableTitleId = useId();
  const selectedTitleId = useId();
  const searchHintId = useId();

  const [selection, setSelection] =
    useState<ProductPickerItem[]>(initialSelected);
  const [savedSelection, setSavedSelection] =
    useState<ProductPickerItem[]>(initialSelected);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<PickerPageData>(initialPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState<ProductPickerQuery>(EMPTY_QUERY);
  const [filters, setFilters] = useState<FilterDraft>({
    productQuery: "",
    vendorQuery: "",
    categoryId: "",
    status: "all",
    sort: "newest",
  });

  const [saveState, saveAction, savePending] = useActionState(
    saveOccasionProducts,
    null,
  );
  const [handledSaveAttempt, setHandledSaveAttempt] = useState<number | null>(
    null,
  );
  const [submittedSelection, setSubmittedSelection] = useState<
    ProductPickerItem[] | null
  >(null);

  const firstLoadRef = useRef(true);
  const requestSequenceRef = useRef(0);

  const selectionDirty = isProductSelectionDirty(selection, savedSelection);
  useUnsavedChangesGuard(selectionDirty);

  if (saveState?.success && saveState.attempt !== handledSaveAttempt) {
    setHandledSaveAttempt(saveState.attempt);
    setSavedSelection(submittedSelection ?? selection);
  }

  const selectedIds = useMemo(
    () => new Set(selection.map((item) => item.id)),
    [selection],
  );
  const visiblePages = totalPages(pageData.total, pageData.pageSize);
  const visibleUnselected = pageData.items.filter(
    (item) => !selectedIds.has(item.id),
  );

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }

    let active = true;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    setLoading(true);
    setLoadError(null);

    loadProductPickerPageAction({ ...query, page: String(query.page) })
      .then((result) => {
        if (!active || sequence !== requestSequenceRef.current) return;
        if (result.ok) {
          setPageData(result.data);
        } else {
          setLoadError(result.error);
        }
      })
      .catch(() => {
        if (!active || sequence !== requestSequenceRef.current) return;
        setLoadError("Could not load products. Please try again.");
      })
      .finally(() => {
        if (!active || sequence !== requestSequenceRef.current) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, retryToken]);

  function applyFilters() {
    const parsed = parseProductPickerQuery(filters);
    setQuery({ ...parsed, page: 1 });
  }

  function clearFilters() {
    setFilters({
      productQuery: "",
      vendorQuery: "",
      categoryId: "",
      status: "all",
      sort: "newest",
    });
    setQuery({ ...EMPTY_QUERY });
  }

  function changeSelection(next: ProductPickerItem[]) {
    setSelection(next);
    setSelectionError(null);
  }

  function addProduct(product: ProductPickerItem) {
    if (savePending) return;
    const result = addProductToSelection(selection, product);
    if (!result.ok) setSelectionError(result.error);
    changeSelection(result.selection);
  }

  function addVisibleProducts() {
    if (savePending) return;
    let next = selection;
    let error: string | null = null;

    for (const product of visibleUnselected) {
      const result = addProductToSelection(next, product);
      next = result.selection;
      if (!result.ok) {
        error = result.error;
        break;
      }
    }

    setSelectionError(error);
    setSelection(next);
  }

  function removeProduct(productId: string) {
    if (savePending) return;
    changeSelection(removeProductFromSelection(selection, productId));
  }

  function moveProduct(productId: string, direction: "up" | "down") {
    if (savePending) return;
    changeSelection(moveProductInSelection(selection, productId, direction));
  }

  function discardSelectionChanges() {
    if (savePending) return;
    setSelection(savedSelection);
    setSelectionError(null);
  }

  function goToPage(page: number) {
    if (loading || page < 1 || page > visiblePages || page === query.page) {
      return;
    }
    setQuery({ ...query, page });
  }

  const filtersChanged =
    filters.productQuery !== query.productQuery ||
    filters.vendorQuery !== query.vendorQuery ||
    filters.categoryId !== (query.categoryId ?? "") ||
    filters.status !== query.status ||
    filters.sort !== query.sort;
  const hasActiveFilters =
    Boolean(query.productQuery) ||
    Boolean(query.vendorQuery) ||
    Boolean(query.categoryId) ||
    query.status !== "all" ||
    query.sort !== "newest";
  const saveError = selectionError ?? (savePending ? null : saveState?.error);
  const saveSuccess = selectionDirty ? null : saveState?.success;
  const matchModeNote =
    matchMode === "automatic"
      ? "This occasion is set to Automatic, so these manual picks are saved but not currently included in the public collection."
      : matchMode === "hybrid"
        ? "Hybrid mode uses these manual picks and will also add automatic matches when matching rules are configured."
        : "Manual mode uses only the products you pick here.";

  return (
    <section
      aria-labelledby={titleId}
      className="mt-12 border-t border-line pt-10"
    >
      <div className="max-w-3xl">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
          Product curation
        </p>
        <h2
          id={titleId}
          className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl"
        >
          Manually picked products
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Search the catalogue, filter by shop or category, and add products in
          the order they should appear. Picks stay selected while you browse.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div
          role="region"
          aria-labelledby={availableTitleId}
          className="rounded-2xl border border-line bg-paper-soft p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3
                id={availableTitleId}
                className="font-display text-2xl text-ink"
              >
                Available products
              </h3>
              <p className="mt-1 text-xs text-ink-mute">
                {loading
                  ? "Loading products..."
                  : `${pageData.total.toLocaleString("en-US")} ${
                      pageData.total === 1 ? "product" : "products"
                    } match ${hasActiveFilters ? "the filters" : "the catalogue"}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={addVisibleProducts}
              disabled={
                loading ||
                savePending ||
                visibleUnselected.length === 0 ||
                selection.length >= PRODUCT_PICKER_MAX_SELECTION
              }
              className={secondaryButtonClass}
            >
              Add visible ({visibleUnselected.length})
            </button>
          </div>

          <form
            role="search"
            aria-label="Filter available products"
            aria-describedby={searchHintId}
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters();
            }}
            className="mt-5 rounded-xl border border-line bg-paper p-3.5"
          >
            <p id={searchHintId} className="sr-only">
              Search by product or shop name, then choose category, status and
              sort order.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Product name
                <input
                  name="product_q"
                  type="search"
                  value={filters.productQuery}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      productQuery: event.target.value,
                    }))
                  }
                  placeholder="Search products"
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Shop name
                <input
                  name="vendor_q"
                  type="search"
                  value={filters.vendorQuery}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      vendorQuery: event.target.value,
                    }))
                  }
                  placeholder="Search shops"
                  maxLength={80}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Category
                <select
                  name="category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Status
                  <select
                    name="status"
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        status: event.target
                          .value as ProductPickerStatusFilter,
                      }))
                    }
                    className={inputClass}
                  >
                    {PRODUCT_PICKER_STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {PRODUCT_PICKER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Sort
                  <select
                    name="sort"
                    value={filters.sort}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        sort: event.target.value as ProductPickerSort,
                      }))
                    }
                    className={inputClass}
                  >
                    {PRODUCT_PICKER_SORTS.map((sort) => (
                      <option key={sort} value={sort}>
                        {PRODUCT_PICKER_SORT_LABELS[sort]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={loading || !filtersChanged}
                className={primaryButtonClass}
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters && !filtersChanged}
                className={secondaryButtonClass}
              >
                Clear filters
              </button>
            </div>
          </form>

          <div aria-live="polite" className="mt-4">
            {loadError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={() => setRetryToken((current) => current + 1)}
                  className="mt-2 rounded-full border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {loading ? (
              <ul aria-hidden className="flex flex-col gap-2">
                {[0, 1, 2, 3].map((item) => (
                  <li
                    key={item}
                    className="h-24 animate-pulse rounded-xl border border-line bg-paper-deep/60"
                  />
                ))}
              </ul>
            ) : null}

            {!loading && !loadError && pageData.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
                <p className="font-medium text-ink">No products found.</p>
                <p className="mt-1 text-sm text-ink-mute">
                  Try a different search or clear the filters.
                </p>
              </div>
            ) : null}

            {!loading && !loadError && pageData.items.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {pageData.items.map((product) => {
                  const selected = selectedIds.has(product.id);
                  const note = productAvailabilityNote(product);

                  return (
                    <li
                      key={product.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper p-3"
                    >
                      <ProductImage
                        path={product.imagePath}
                        alt={product.imageAlt ?? product.name}
                        name={product.name}
                        className="h-16 w-16 shrink-0"
                        rounded="rounded-lg"
                        sizes="64px"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-ink">
                            {product.name}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[product.status]}`}
                          >
                            {product.status}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-ink-mute">
                          {product.vendorName}
                          {product.categoryName
                            ? ` \u00b7 ${product.categoryName}`
                            : ""}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {formatEgp(product.priceMinor)}
                          <span className="mx-1.5 text-line-strong">|</span>
                          {product.stock === 0
                            ? "Out of stock"
                            : `${product.stock} in stock`}
                        </p>
                        {note ? (
                          <p className="mt-1 text-[0.7rem] font-medium text-amber-800">
                            {note}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={
                          selected ||
                          savePending ||
                          selection.length >= PRODUCT_PICKER_MAX_SELECTION
                        }
                        aria-label={
                          selected
                            ? `${product.name} is already selected`
                            : `Add ${product.name}`
                        }
                        className={
                          selected
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800"
                            : primaryButtonClass
                        }
                      >
                        {selected ? "Added" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {pageData.total > pageData.pageSize ? (
            <nav
              aria-label="Available product pages"
              className="mt-5 flex flex-wrap items-center justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => goToPage(query.page - 1)}
                disabled={loading || query.page <= 1}
                className={secondaryButtonClass}
              >
                Previous
              </button>
              <p className="text-sm text-ink-soft">
                Page {query.page} of {visiblePages}
                <span className="mx-1.5 text-line-strong">|</span>
                {pageData.total.toLocaleString("en-US")} total
              </p>
              <button
                type="button"
                onClick={() => goToPage(query.page + 1)}
                disabled={loading || query.page >= visiblePages}
                className={secondaryButtonClass}
              >
                Next
              </button>
            </nav>
          ) : null}
        </div>

        <aside
          role="complementary"
          aria-labelledby={selectedTitleId}
          className="rounded-2xl border border-line bg-paper p-4 sm:p-5 lg:sticky lg:top-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3
                id={selectedTitleId}
                className="font-display text-2xl text-ink"
              >
                Selected products
              </h3>
              <p className="mt-1 text-xs text-ink-mute">
                {selection.length} of {PRODUCT_PICKER_MAX_SELECTION} selected
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${
                selectionDirty
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {selectionDirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>

          <p className="mt-4 rounded-xl border border-line bg-paper-soft px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
            {matchModeNote}
          </p>

          <form
            action={saveAction}
            onSubmit={() => {
              setSubmittedSelection(selection);
            }}
            className="mt-4"
          >
            <input type="hidden" name="occasion_id" value={occasionId} />
            {selection.map((product) => (
              <input
                key={product.id}
                type="hidden"
                name="product_ids"
                value={product.id}
              />
            ))}

            {selection.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
                <p className="font-medium text-ink">No manual picks yet.</p>
                <p className="mt-1 text-sm text-ink-mute">
                  Add products from the catalogue to build this occasion.
                </p>
              </div>
            ) : (
              <ol className="flex max-h-[30rem] flex-col gap-2 overflow-y-auto pr-1">
                {selection.map((product, index) => {
                  const note = productAvailabilityNote(product);

                  return (
                    <li
                      key={product.id}
                      className="rounded-xl border border-line bg-paper-soft p-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-berry-soft font-mono text-[0.7rem] font-semibold text-berry-deep"
                        >
                          {index + 1}
                        </span>
                        <ProductImage
                          path={product.imagePath}
                          alt={product.imageAlt ?? product.name}
                          name={product.name}
                          className="h-12 w-12 shrink-0"
                          rounded="rounded-md"
                          sizes="48px"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {product.name}
                          </p>
                          <p className="truncate text-[0.7rem] text-ink-mute">
                            {product.vendorName} |{" "}
                            {formatEgp(product.priceMinor)}
                          </p>
                          {note ? (
                            <p className="mt-1 text-[0.68rem] font-medium text-amber-800">
                              {note}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveProduct(product.id, "up")}
                          disabled={savePending || index === 0}
                          aria-label={`Move ${product.name} up`}
                          className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveProduct(product.id, "down")}
                          disabled={
                            savePending || index === selection.length - 1
                          }
                          aria-label={`Move ${product.name} down`}
                          className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(product.id)}
                          disabled={savePending}
                          aria-label={`Remove ${product.name}`}
                          className="rounded-full border border-red-200 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <div aria-live="polite" className="mt-4 min-h-5 text-sm">
              {saveError ? (
                <p role="alert" className="text-red-800">
                  {saveError}
                </p>
              ) : saveSuccess ? (
                <p className="text-emerald-800">{saveSuccess}</p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!selectionDirty || savePending}
                className={primaryButtonClass}
              >
                {savePending ? "Saving..." : "Save product selection"}
              </button>
              <button
                type="button"
                onClick={discardSelectionChanges}
                disabled={!selectionDirty || savePending}
                className={secondaryButtonClass}
              >
                Discard changes
              </button>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-mute">
              Saving replaces the complete manual selection. Products are
              stored in the order shown above.
            </p>
          </form>

          <div className="mt-5 rounded-xl border border-line bg-paper-soft px-3.5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Preview note
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-mute">
              This list previews the manual picks only. Automatic category and
              tag matching is not configured in this phase, so no automatic
              products are shown.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
