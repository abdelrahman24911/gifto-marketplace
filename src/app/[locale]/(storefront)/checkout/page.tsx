import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { getRequestContext } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";
import {
  checkBuyNowAvailability,
  parseBuyNowProductRequest,
  type BuyNowCheckout,
} from "@/lib/buy-now";
import { isVendorBlockedFromOrders } from "@/lib/demo-containment";

import { CheckoutForm, type CheckoutDefaults } from "./checkout-form";
import type { SavedAddress } from "@/lib/saved-address";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("checkout");
  return pageMetadata({
    title: `${t("title")} — Gifto`,
    description: t("subtitle"),
    path: `${localePrefixFor(locale)}/checkout`,
  });
}

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
  const t = useTranslations("checkout");
  const tc = useTranslations("common");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t("title")}
      </h1>

      <div className="mt-6 rounded-2xl border border-line bg-paper-soft p-6">
        <p className="font-display text-xl text-ink">
          {t("unavailableTitle")}
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
              {t("backToProduct")}
            </Link>
          ) : null}
          <Link
            href="/shops"
            className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/35 hover:text-berry"
          >
            {tc("browseShops")}
          </Link>
          <Link
            href="/cart"
            className="text-sm font-medium text-berry hover:text-berry-deep"
          >
            {tc("viewCart")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const t = await getTranslations("checkout");
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
      buyNowError = t("buyNowInvalid");
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
        buyNowError = t("buyNowUnavailable");
      } else {
        const vendor = Array.isArray(data.vendor)
          ? (data.vendor[0] ?? null)
          : data.vendor;

        if (!vendor) {
          buyNowError = t("buyNowUnavailable");
        } else {
          buyNowBackHref = `/shops/${vendor.slug}/${data.slug}`;

          // P0 demo containment (migration 67): a demo shop's buy-now
          // fails with the same paused message as a paused shop.
          const blocked = await isVendorBlockedFromOrders(vendor.id);
          const availability = checkBuyNowAvailability(
            request.quantity,
            data.stock,
            vendor.is_accepting_orders && !blocked,
          );

          if (!availability.ok) {
            if (availability.reason === "paused") {
              buyNowError = t("paused", { shop: vendor.name });
            } else if (availability.reason === "sold-out") {
              buyNowError = t("soldOut");
            } else {
              buyNowError = t("onlyAvailable", {
                count: availability.available,
              });
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
    giftWrap: false,
    giftMessage: "",
    preferredDeliveryDate: "",
    deliveryTimeNote: "",
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

  // Saved addresses (migration 47). The default address pre-fills the form;
  // the picker in the form offers the rest. A saved address never rewrites
  // a placed order — checkout copies its fields into the order snapshot.
  let savedAddresses: SavedAddress[] = [];
  if (user) {
    const { data: addressRows } = await supabase
      .from("saved_addresses")
      .select(
        "id, label, recipient_name, contact_phone, address_line, city, governorate, notes, is_default",
      )
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          label: string;
          recipient_name: string;
          contact_phone: string;
          address_line: string;
          city: string;
          governorate: string;
          notes: string | null;
          is_default: boolean;
        }[]
      >();

    savedAddresses = (addressRows ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      recipientName: row.recipient_name,
      contactPhone: row.contact_phone,
      addressLine: row.address_line,
      city: row.city,
      governorate: row.governorate,
      notes: row.notes,
    }));

    // The first row is the default when one exists (is_default sorts first).
    // Without a default the profile pre-fill above stands.
    const defaultAddress =
      addressRows?.find((row) => row.is_default) ?? null;
    if (defaultAddress) {
      const match = savedAddresses.find(
        (address) => address.id === defaultAddress.id,
      );
      if (match) {
        defaults.recipientName = match.recipientName;
        defaults.contactPhone = match.contactPhone;
        defaults.addressLine = match.addressLine;
        defaults.city = match.city;
        defaults.governorate = match.governorate;
        defaults.notes = match.notes ?? "";
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">{t("subtitle")}</p>

      {buyNow ? (
        <p className="mt-4 inline-flex rounded-full border border-berry-tint bg-berry-soft px-3 py-1.5 text-sm font-medium text-berry-deep">
          {t("buyNowOnly")}
        </p>
      ) : null}

      <CheckoutForm
        defaults={defaults}
        buyNow={buyNow}
        savedAddresses={savedAddresses}
      />
    </div>
  );
}
