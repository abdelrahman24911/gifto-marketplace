import Link from "next/link";

/**
 * Vendor product 404 — a deleted product's edit URL (or a wrong id) lands
 * here instead of the storefront "This gift isn't here" page, with a way
 * back to the shop's product list. /vendor/products resolves the vendor
 * from the session when no vendor param is given.
 */
export default function VendorProductNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-dashed border-line-strong bg-paper-soft px-6 py-12 text-center">
        <p className="font-display text-xl text-ink">
          This product isn&apos;t here
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          It may have been deleted, or the address is incorrect. Deleted
          products cannot be restored — add the product again if it is still
          sold.
        </p>
        <Link
          href="/vendor/products"
          className="mt-5 inline-flex rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
        >
          Back to products
        </Link>
      </div>
    </div>
  );
}
