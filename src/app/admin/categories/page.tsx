import Link from "next/link";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";

import {
  AdminActionLink,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";
import { CategoryForm } from "./category-form";
import { CategoryRowActions } from "./category-row-actions";

export const metadata = { title: "Categories — Admin — Gifto" };

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
};

type ProductCategoryRow = {
  category_id: string | null;
};

export default async function AdminCategoriesPage() {
  const { supabase } = await requirePlatformAdmin();

  const [categoriesResult, productsResult] = await Promise.all([
    fetchAllRows<CategoryRow>((from, to) =>
      supabase
        .from("categories")
        .select(
          "id, name, slug, description, position, is_active, created_at",
        )
        .order("position", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<CategoryRow[]>(),
    ),
    fetchAllRows<ProductCategoryRow>((from, to) =>
      supabase
        .from("products")
        .select("category_id")
        .order("id", { ascending: true })
        .range(from, to)
        .returns<ProductCategoryRow[]>(),
    ),
  ]);

  const categories = categoriesResult.rows;
  const activeCount = categories.filter((category) => category.is_active).length;
  const hiddenCount = categories.length - activeCount;
  const productCounts = new Map<string, number>();
  let unassignedProducts = 0;

  for (const product of productsResult.rows) {
    if (product.category_id) {
      productCounts.set(
        product.category_id,
        (productCounts.get(product.category_id) ?? 0) + 1,
      );
    } else {
      unassignedProducts += 1;
    }
  }

  const productCountsComplete =
    !productsResult.failed && !productsResult.truncated;
  const countLabel = (count: number) => {
    if (productsResult.failed) return "—";
    return productsResult.truncated ? `${count}+` : String(count);
  };
  const activeCategories = categories.filter(
    (category) => category.is_active,
  );
  const hiddenCategories = categories.filter(
    (category) => !category.is_active,
  );

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Categories" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Shared catalog"
          title="Categories"
          description="The vocabulary every shop uses to list gifts. Keep the catalog legible for shoppers and useful for occasion matching."
          actions={
            <AdminActionLink href="/admin/categories#add-category" primary>
              Add a category
            </AdminActionLink>
          }
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Live categories",
              value: categoriesResult.truncated ? "Incomplete" : activeCount,
              hint: "Visible in the storefront",
              emphasis: "positive",
            },
            {
              label: "Hidden",
              value: categoriesResult.truncated ? "Incomplete" : hiddenCount,
              hint: "Kept for catalog history",
            },
            {
              label: "Total",
              value: categoriesResult.truncated
                ? "Incomplete"
                : categories.length,
              hint: "Ordered by position",
              emphasis: "accent",
            },
            {
              label: "Product placements",
              value: productsResult.failed
                ? "Unavailable"
                : countLabel(
                    productsResult.rows.length - unassignedProducts,
                  ),
              hint: `${countLabel(unassignedProducts)} without a category`,
            },
          ]}
        />
      </div>

      {categoriesResult.failed || categoriesResult.truncated ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            The category list could not be read in full. Counts and the list
            below may be incomplete. Refresh the page to try again.
          </AdminNotice>
        </div>
      ) : null}

      {!productCountsComplete ? (
        <div className="mt-4">
          <AdminNotice tone="info" role="status">
            Product placement counts are incomplete because the product catalog
            is larger than the current read. Category names and statuses remain
            accurate.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
            <h2 className="font-display text-2xl text-ink">Catalog order</h2>
            <p className="text-xs text-ink-mute">
              Position controls the public browse sequence.
            </p>
          </div>

          {categoriesResult.failed ? (
            <div className="mt-6">
              <AdminNotice tone="danger" role="alert">
                Categories are unavailable right now. The onboarding form is
                still available, but refresh before adding a duplicate.
              </AdminNotice>
            </div>
          ) : categories.length === 0 ? (
            <div className="mt-6">
              <EmptyState title="No categories yet">
                Add the first category to give shops a shared catalog structure.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-6">
              <CategoryGroup
                title="Live"
                categories={activeCategories}
                productCounts={productCounts}
                countLabel={countLabel}
              />
              {hiddenCategories.length > 0 ? (
                <CategoryGroup
                  title="Hidden"
                  categories={hiddenCategories}
                  productCounts={productCounts}
                  countLabel={countLabel}
                />
              ) : null}
            </div>
          )}
        </div>

        <aside id="add-category" className="scroll-mt-24">
          <div className="rounded-2xl border border-line bg-paper-soft p-5 xl:sticky xl:top-24">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-berry">
              New taxonomy
            </p>
            <h2 className="mt-2 font-display text-3xl leading-none text-ink">
              Add a category
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              New categories are active immediately and appear anywhere a
              storefront uses the shared catalog.
            </p>
            <div className="mt-5">
              <CategoryForm />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CategoryGroup({
  title,
  categories,
  productCounts,
  countLabel,
}: {
  title: string;
  categories: CategoryRow[];
  productCounts: ReadonlyMap<string, number>;
  countLabel: (count: number) => string;
}) {
  if (categories.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3">
        <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-mute">
          {title}
        </h3>
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs tabular-nums text-ink-mute">
          {categories.length}
        </span>
      </div>
      <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-paper-soft">
        {categories.map((category) => (
          <li
            key={category.id}
            className="grid gap-4 border-b border-line px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="break-words text-base font-medium text-ink">
                  {category.name}
                </h4>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${
                    category.is_active
                      ? "border-success/25 bg-success-soft text-ink"
                      : "border-line-strong bg-paper text-ink-mute"
                  }`}
                >
                  {category.is_active ? "Live" : "Hidden"}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-ink-mute">
                /categories/{category.slug}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
                {category.description || "No description yet."}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
                <span>Position {category.position}</span>
                {category.is_active ? (
                  <Link
                    href={`/categories/${category.slug}`}
                    className="font-medium text-berry hover:underline"
                  >
                    View storefront
                  </Link>
                ) : null}
              </div>
              <CategoryRowActions
                category={category}
                productCount={productCounts.get(category.id) ?? 0}
                productCountLabel={countLabel(
                  productCounts.get(category.id) ?? 0,
                )}
              />
            </div>
            <div className="text-left sm:text-right">
              <p className="font-display text-2xl tabular-nums text-ink">
                {countLabel(productCounts.get(category.id) ?? 0)}
              </p>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                Products
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
