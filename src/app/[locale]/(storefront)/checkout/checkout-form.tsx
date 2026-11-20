"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useCart } from "@/components/cart-provider";
import { ProductImage } from "@/components/product-image";
import { useToast } from "@/components/toast-provider";
import { Link, useRouter } from "@/i18n/navigation";
import {
  selectCheckoutItems,
  shouldClearCartAfterOrder,
  type BuyNowCheckout,
} from "@/lib/buy-now";
import {
  cartSubtotalMinor,
  toOrderItems,
  type CartItem,
} from "@/lib/cart";
import {
  GIFT_MESSAGE_MAX_LENGTH,
  preferredDeliveryDateRange,
  validateGiftOptions,
} from "@/lib/gift-options";
import {
  getGiftOptionsServerSnapshot,
  getGiftOptionsSnapshot,
  setGiftOptions,
  subscribeGiftOptions,
} from "@/lib/gift-options-store";
import { createGuestAttempt, type GuestAttempt } from "@/lib/guest-client";
import {
  GOVERNORATES,
  governorateLabel,
  normalizeGovernorate,
} from "@/lib/governorates";
import { formatEgp, type MoneyLocale } from "@/lib/money";
import type { SavedAddress } from "@/lib/saved-address";

import { placeOrder, type CheckoutState, type CheckoutValues } from "./actions";

export type CheckoutDefaults = CheckoutValues;

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

function groupByVendor(items: CartItem[]): [string, CartItem[]][] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const existing = groups.get(item.vendorId);
    if (existing) existing.push(item);
    else groups.set(item.vendorId, [item]);
  }
  return [...groups.entries()];
}

export function CheckoutForm({
  defaults,
  buyNow = null,
  savedAddresses = [],
}: {
  defaults: CheckoutValues;
  buyNow?: BuyNowCheckout | null;
  savedAddresses?: SavedAddress[];
}) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const locale = useLocale() as MoneyLocale;
  const router = useRouter();
  const { items, ready, clear } = useCart();
  const { flash } = useToast();
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    placeOrder,
    null,
  );
  const handled = useRef(false);
  // One attempt id + access token per mounted checkout. Retries (double-click,
  // network retry) resubmit the same values so the database can deduplicate.
  // Generated lazily on first render; the values are secret so the server and
  // client intentionally produce different ones (suppressed on the inputs).
  const [attempt] = useState<GuestAttempt>(() => createGuestAttempt());

  const isBuyNow = buyNow !== null;
  const checkoutItems = selectCheckoutItems(items, buyNow?.item ?? null);
  const checkoutSubtotalMinor = cartSubtotalMinor(checkoutItems);

  const values = state && "values" in state ? state.values : defaults;

  // Gift wrap/message are order-level and shared with the cart page's
  // "Make it a gift" draft through the gift-options store (localStorage).
  // The store is read with useSyncExternalStore, so the server render
  // (empty draft) and the hydrated render (stored draft) never mismatch.
  // Unchecking gift wrap clears the message instead of submitting a
  // stale one. The preferred day and time note are checkout-only and
  // stay in local component state.
  const giftDraft = useSyncExternalStore(
    subscribeGiftOptions,
    getGiftOptionsSnapshot,
    getGiftOptionsServerSnapshot,
  );
  const giftWrap = giftDraft.giftWrap;
  const giftMessage = giftDraft.giftMessage;
  const [preferredDeliveryDate, setPreferredDeliveryDate] = useState(
    defaults.preferredDeliveryDate,
  );
  const [deliveryTimeNote, setDeliveryTimeNote] = useState(
    defaults.deliveryTimeNote,
  );
  const [pickedAddressId, setPickedAddressId] = useState<string | null>(null);
  const dateRange = preferredDeliveryDateRange();

  const pickedAddress =
    savedAddresses.find((address) => address.id === pickedAddressId) ?? null;
  // A picked saved address overwrites the delivery fields; everything else
  // (email, gift options) is left as the customer entered it.
  const fieldValues: CheckoutValues = pickedAddress
    ? {
        ...values,
        recipientName: pickedAddress.recipientName,
        contactPhone: pickedAddress.contactPhone,
        addressLine: pickedAddress.addressLine,
        city: pickedAddress.city,
        governorate: pickedAddress.governorate,
        notes: pickedAddress.notes ?? values.notes,
      }
    : values;
  const formKey =
    state && "attempt" in state
      ? `state-${state.attempt}-${pickedAddressId ?? "none"}`
      : `pristine-${pickedAddressId ?? "none"}`;

  useEffect(() => {
    if (state && "orderId" in state && !handled.current) {
      handled.current = true;

      // The toast must survive the navigation to the order page.
      flash(t("orderPlaced"), "success");

      // Buy Now must leave the existing cart exactly as it was.
      if (shouldClearCartAfterOrder(isBuyNow)) clear();

      router.replace(
        state.isGuest
          ? `/orders/${state.orderId}`
          : `/account/orders/${state.orderId}`,
      );
    }
  }, [state, clear, router, isBuyNow, flash, t]);

  if (!isBuyNow && !ready) {
    return <p className="mt-6 text-sm text-zinc-500">{t("loading")}</p>;
  }

  if (checkoutItems.length === 0 && !(state && "orderId" in state)) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
        <p className="text-sm text-zinc-600">
          {t("emptyCart")}
        </p>
        <Link
          href="/shops"
          className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {tc("browseShops")}
        </Link>
      </div>
    );
  }

  const giftError = validateGiftOptions({
    giftWrap,
    giftMessage,
    preferredDeliveryDate,
    deliveryTimeNote,
  });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <form
        key={formKey}
        action={formAction}
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5"
      >
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(toOrderItems(checkoutItems))}
          readOnly
        />
        <input
          type="hidden"
          name="expected_prices"
          value={JSON.stringify(
            checkoutItems.map((item) => ({
              product_id: item.productId,
              unit_price_minor: item.priceMinor,
            })),
          )}
          readOnly
        />
        <input
          type="hidden"
          name="expected_total"
          value={String(checkoutSubtotalMinor)}
          readOnly
        />
        <input
          type="hidden"
          name="idempotency_key"
          value={attempt.idempotencyKey}
          suppressHydrationWarning
          readOnly
        />
        <input
          type="hidden"
          name="guest_token"
          value={attempt.token}
          suppressHydrationWarning
          readOnly
        />

        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {t("deliveryDetails")}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t("deliveryDetailsBody")}
          </p>
        </div>

        {isBuyNow ? (
          <p className="rounded-md border border-berry-tint bg-berry-soft px-3 py-2 text-sm text-berry-deep">
            {t("buyNowNote")}
          </p>
        ) : null}

        {state && "error" in state ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}

        {giftError ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {giftError}
          </p>
        ) : null}

        {state && "priceChanged" in state ? (
          <div
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
          >
            <p className="font-medium">
              {t("pricesChanged")}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {state.priceChanged.lines
                .filter((line) => line.expectedMinor !== line.liveMinor)
                .map((line) => (
                  <li
                    key={line.productId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {line.name} × {line.quantity}
                    </span>
                    <span className="whitespace-nowrap">
                      <s>{formatEgp(line.expectedMinor, locale)}</s> →{" "}
                      <strong>{formatEgp(line.liveMinor, locale)}</strong>{" "}
                      {t("each")}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-2">
              {t("newTotal", {
                new: formatEgp(state.priceChanged.liveTotalMinor, locale),
                old: formatEgp(state.priceChanged.expectedTotalMinor, locale),
              })}
            </p>
            <button
              type="submit"
              name="price_confirmation"
              value={JSON.stringify({
                prices: state.priceChanged.lines.map((line) => ({
                  product_id: line.productId,
                  unit_price_minor: line.liveMinor,
                })),
                total: state.priceChanged.liveTotalMinor,
              })}
              disabled={pending}
              className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("confirmNewPrices")}
            </button>
            <p className="mt-2 text-xs">
              {t("nothingOrdered")}
            </p>
          </div>
        ) : null}

        {savedAddresses.length > 0 ? (
          <label className={labelClass}>
            {t("savedAddress")}
            <select
              value={pickedAddressId ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                setPickedAddressId(next === "" ? null : next);
              }}
              className={inputClass}
            >
              <option value="">{t("savedAddressPlaceholder")}</option>
              {savedAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label} — {address.addressLine}, {address.city}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={labelClass}>
          {t("recipientName")}
          <input
            type="text"
            name="recipient_name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            defaultValue={fieldValues.recipientName}
            placeholder={t("recipientPlaceholder")}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          {t("contactPhone")}
          <input
            type="tel"
            name="contact_phone"
            required
            minLength={5}
            maxLength={30}
            inputMode="tel"
            autoComplete="tel"
            defaultValue={fieldValues.contactPhone}
            placeholder="01xxxxxxxxx"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          {t("contactEmail")}
          <input
            type="email"
            name="contact_email"
            maxLength={254}
            inputMode="email"
            autoComplete="email"
            defaultValue={fieldValues.contactEmail}
            placeholder="you@example.com"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          {t("address")}
          <input
            type="text"
            name="address_line"
            required
            minLength={5}
            maxLength={300}
            autoComplete="street-address"
            defaultValue={fieldValues.addressLine}
            placeholder={t("addressPlaceholder")}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            {t("city")}
            <input
              type="text"
              name="city"
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level2"
              defaultValue={fieldValues.city}
              placeholder={t("cityPlaceholder")}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            {t("governorate")}
            <select
              name="governorate"
              required
              autoComplete="address-level1"
              defaultValue={normalizeGovernorate(fieldValues.governorate) ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                {t("chooseGovernorate")}
              </option>
              {GOVERNORATES.map((governorate) => (
                <option key={governorate.en} value={governorate.en}>
                  {locale === "ar"
                    ? governorate.ar
                    : governorateLabel(governorate.en)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          {t("deliveryNotes")}
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={fieldValues.notes}
            placeholder={t("deliveryNotesPlaceholder")}
            className={inputClass}
          />
        </label>

        <fieldset className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <legend className="px-1 text-sm font-semibold text-zinc-900">
            {t("giftTitle")}
          </legend>
          <label className="flex items-start gap-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              name="gift_wrap"
              value="1"
              checked={giftWrap}
              onChange={(event) => {
                const next = event.target.checked;
                setGiftOptions({
                  giftWrap: next,
                  giftMessage: next ? giftMessage : "",
                });
              }}
              className="mt-0.5 h-4 w-4 accent-zinc-900"
            />
            <span>
              {t("giftWrap")}
              <span className="block text-xs font-normal text-zinc-500">
                {t("giftWrapNote")}
              </span>
            </span>
          </label>

          <label className="mt-3 flex flex-col gap-1 text-sm font-medium text-zinc-700">
            {t("giftMessage")}
            <textarea
              name="gift_message"
              rows={2}
              maxLength={GIFT_MESSAGE_MAX_LENGTH}
              value={giftMessage}
              disabled={!giftWrap}
              onChange={(event) =>
                setGiftOptions({
                  giftWrap,
                  giftMessage: event.target.value,
                })
              }
              placeholder={t("giftMessagePlaceholder")}
              className={`${inputClass} bg-white disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
            />
          </label>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              {t("preferredDate")}
              <input
                type="date"
                name="preferred_delivery_date"
                value={preferredDeliveryDate}
                min={dateRange.min}
                max={dateRange.max}
                onChange={(event) =>
                  setPreferredDeliveryDate(event.target.value)
                }
                className={inputClass}
              />
              <span className="text-xs font-normal text-zinc-500">
                {t("preferredDateHint")}
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              {t("timeNote")}
              <input
                type="text"
                name="delivery_time_note"
                maxLength={200}
                value={deliveryTimeNote}
                onChange={(event) => setDeliveryTimeNote(event.target.value)}
                placeholder={t("timeNotePlaceholder")}
                className={inputClass}
              />
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending || giftError !== null}
          className="mt-1 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("placingOrder") : t("placeOrder")}
        </button>

        <p className="text-xs leading-relaxed text-zinc-500">
          {t.rich("termsAgreement", {
            terms: (chunks) => (
              <Link
                href="/terms"
                className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
              >
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/privacy"
                className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
              >
                {chunks}
              </Link>
            ),
            refund: (chunks) => (
              <Link
                href="/refund-policy"
                className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </form>

      <aside className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">{t("orderSummary")}</h2>

        {buyNow ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-start gap-3">
              <ProductImage
                path={buyNow.item.imagePath}
                alt={buyNow.item.name}
                name={buyNow.item.name}
                className="h-16 w-16"
                sizes="64px"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={buyNow.backHref}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {buyNow.item.name}
                </Link>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {buyNow.item.vendorName} ·{" "}
                  {t("quantity", { count: buyNow.item.quantity })}
                </p>
                <p className="mt-1 font-medium text-zinc-900">
                  {formatEgp(
                    buyNow.item.priceMinor * buyNow.item.quantity,
                    locale,
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {groupByVendor(checkoutItems).map(([vendorId, vendorItems]) => (
              <div key={vendorId}>
                <p className="text-sm font-medium text-zinc-900">
                  {vendorItems[0].vendorName}
                </p>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-zinc-600">
                  {vendorItems.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="min-w-0">
                        {item.name}
                        <span className="text-zinc-400"> × {item.quantity}</span>
                      </span>
                      <span className="whitespace-nowrap text-zinc-900">
                        {formatEgp(item.priceMinor * item.quantity, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <dl className="mt-5 flex flex-col gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-600">
          <div className="flex items-center justify-between">
            <dt>{t("items")}</dt>
            <dd className="font-medium text-zinc-900">
              {formatEgp(checkoutSubtotalMinor, locale)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>{t("delivery")}</dt>
            <dd className="font-medium text-zinc-900">{t("free")}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-base">
            <dt className="font-medium text-zinc-900">{t("total")}</dt>
            <dd className="font-semibold text-zinc-900">
              {formatEgp(checkoutSubtotalMinor, locale)}
            </dd>
          </div>
        </dl>

        {giftWrap ? (
          <p className="mt-4 rounded-md border border-berry-tint bg-berry-soft px-3 py-2 text-xs text-berry-deep">
            {t("giftWrapSummary")}
            {preferredDeliveryDate
              ? ` ${t("preferredDateSummary", { date: preferredDeliveryDate })}`
              : null}
          </p>
        ) : preferredDeliveryDate ? (
          <p className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            {t("preferredDateSummary", { date: preferredDeliveryDate })}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-zinc-500">
          {t("summaryNote")}
          {isBuyNow ? t("summaryNoteBuyNow") : null}
        </p>
      </aside>
    </div>
  );
}
