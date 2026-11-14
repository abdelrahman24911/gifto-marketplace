import Link from "next/link";

import { getRequestContext } from "@/lib/auth";
import {
  checkBuyNowAvailability,
  parseBuyNowProductRequest,
  type BuyNowCheckout,
} from "@/lib/buy-now";

import { CheckoutForm, type CheckoutDefaults } from "./checkout-form";

export const metadata = { title: "Checkout" };

type BuyNowVendor = {
  id: string;
  name: string;
  slug: string;
  is_accepting_orders: boolean;
};

type BuyNowProductRow = {
  id: string;
  name: string;
  slug: string;
  price_minor: number;
  stock: number;
  vendor: BuyNowVendor | BuyNowVendor[] | null;
  product_images: { path: string; alt: string | null; position: number }[] | null;
};

type CheckoutPageProps = {
  searchParams: Promise<{ buyNow?: string; quantity?: string }>;
};

function CheckoutUnavailable({
  message,
  backHref,
}: {
  message: string;
  backHref: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Checkout
      </h1>

      <div className="mt-6 rounded-2xl border border-line bg-paper-soft p-6">
        <p className="font-display text-xl text-ink">
          This Buy Now checkout can&apos;t continue
        </p>
        <p role="alert" className="mt-2 text-sm leading-relaxed text-ink-soft">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
            >
              Back to the product
            </Link>
          ) : null}
          <Link
            href="/shops"
            className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/35 hover:text-berry"
          >
            Browse shops
          </Link>
          <Link
            href="/cart"
            className="text-sm font-medium text-berry hover:text-berry-deep"
          >
            View cart
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const params = await searchParams;
  const buyNowValue = params.buyNow?.trim() ?? "";
  const isBuyNow = buyNowValue.length > 0;

  // Shares the header's request-scoped session lookup instead of opening a
  // second one. This only pre-fills the form; the Server Action re-verifies the
  // session with the Auth server before placing an order.
  const { supabase, user } = await getRequestContext();

  let buyNow: BuyNowCheckout | null = null;
  let buyNowError: string | null = null;
  let buyNowBackHref: string | null = null;

  if (isBuyNow) {
    const request = parseBuyNowProductRequest(buyNowValue, params.quantity);

    if (!request) {
      buyNowError =
        "This Buy Now link is invalid. Return to the product and choose Buy Now again.";
    } else {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, price_minor, stock, vendor:public_vendors!inner(id, name, slug, is_accepting_orders), product_images(path, alt, position)",
        )
        .eq("id", request.productId)
        .eq("status", "active")
        .maybeSingle<BuyNowProductRow>();

      if (error || !data) {
        buyNowError = "This gift is no longer available for Buy Now.";
      } else {
        const vendor = Array.isArray(data.vendor)
          ? (data.vendor[0] ?? null)
          : data.vendor;

        if (!vendor) {
          buyNowError = "This gift is no longer available for Buy Now.";
        } else {
          buyNowBackHref = `/shops/${vendor.slug}/${data.slug}`;

          const availability = checkBuyNowAvailability(
            request.quantity,
            data.stock,
            vendor.is_accepting_orders,
          );

          if (!availability.ok) {
            if (availability.reason === "paused") {
              buyNowError = `${vendor.name} has paused new orders right now.`;
            } else if (availability.reason === "sold-out") {
              buyNowError = "This gift is sold out.";
            } else {
              buyNowError = `Only ${availability.available} of this gift are available right now.`;
            }
          } else {
            const images = [...(data.product_images ?? [])].sort(
              (a, b) => a.position - b.position,
            );

            buyNow = {
              backHref: buyNowBackHref,
              item: {
                productId: data.id,
                vendorId: vendor.id,
                vendorName: vendor.name,
                vendorSlug: vendor.slug,
                name: data.name,
                slug: data.slug,
                priceMinor: data.price_minor,
                imagePath: images[0]?.path ?? null,
                stock: data.stock,
                quantity: request.quantity,
              },
            };
          }
        }
      }
    }
  }

  if (buyNowError) {
    return (
      <CheckoutUnavailable message={buyNowError} backHref={buyNowBackHref} />
    );
  }

  const defaults: CheckoutDefaults = {
    recipientName: "",
    contactPhone: "",
    contactEmail: "",
    addressLine: "",
    city: "",
    governorate: "",
    notes: "",
  };

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();

    defaults.recipientName = profile?.full_name ?? "";
    defaults.contactPhone = profile?.phone ?? "";
    defaults.contactEmail = user.email ?? "";
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Checkout
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Cash on delivery. No account needed — orders that span several shops are
        split into separate deliveries, each handled by its own shop.
      </p>

      {buyNow ? (
        <p className="mt-4 inline-flex rounded-full border border-berry-tint bg-berry-soft px-3 py-1.5 text-sm font-medium text-berry-deep">
          Buy now — only this gift will be ordered. Your cart is unchanged.
        </p>
      ) : null}

      <CheckoutForm defaults={defaults} buyNow={buyNow} />
    </div>
  );
}
