"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { useCart } from "@/components/cart-provider";
import { toOrderItems, type CartItem } from "@/lib/cart";
import { formatEgp } from "@/lib/money";

import { placeOrder, type CheckoutState, type CheckoutValues } from "./actions";

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

export function CheckoutForm({ defaults }: { defaults: CheckoutValues }) {
  const router = useRouter();
  const { items, subtotalMinor, ready, clear } = useCart();
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(
    placeOrder,
    null,
  );
  const handled = useRef(false);

  const values = state && "values" in state ? state.values : defaults;
  const formKey =
    state && "attempt" in state ? `state-${state.attempt}` : "pristine";

  useEffect(() => {
    if (state && "orderId" in state && !handled.current) {
      handled.current = true;
      clear();
      router.replace(`/account/orders/${state.orderId}`);
    }
  }, [state, clear, router]);

  if (!ready) {
    return <p className="mt-6 text-sm text-zinc-500">Loading your cart…</p>;
  }

  if (items.length === 0 && !(state && "orderId" in state)) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
        <p className="text-sm text-zinc-600">
          Your cart is empty, so there is nothing to check out.
        </p>
        <Link
          href="/shops"
          className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Browse shops
        </Link>
      </div>
    );
  }

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
          value={JSON.stringify(toOrderItems(items))}
          readOnly
        />

        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Delivery details
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            The shop contacts this number to arrange delivery. Payment is cash
            on delivery.
          </p>
        </div>

        {state && "error" in state ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}

        <label className={labelClass}>
          Recipient name
          <input
            type="text"
            name="recipient_name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={values.recipientName}
            placeholder="Who should receive the gift?"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Contact phone
          <input
            type="tel"
            name="contact_phone"
            required
            minLength={5}
            maxLength={30}
            defaultValue={values.contactPhone}
            placeholder="01xxxxxxxxx"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Address
          <input
            type="text"
            name="address_line"
            required
            minLength={5}
            maxLength={300}
            defaultValue={values.addressLine}
            placeholder="Street, building, floor, apartment"
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            City
            <input
              type="text"
              name="city"
              required
              minLength={2}
              maxLength={80}
              defaultValue={values.city}
              placeholder="e.g. Cairo"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Governorate
            <input
              type="text"
              name="governorate"
              required
              minLength={2}
              maxLength={80}
              defaultValue={values.governorate}
              placeholder="e.g. Cairo Governorate"
              className={inputClass}
            />
          </label>
        </div>

        <label className={labelClass}>
          Delivery notes (optional)
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={values.notes}
            placeholder="Landmarks, preferred time, gift message…"
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Placing order…" : "Place order (cash on delivery)"}
        </button>
      </form>

      <aside className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Order summary</h2>

        <div className="mt-4 flex flex-col gap-4">
          {groupByVendor(items).map(([vendorId, vendorItems]) => (
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
                      {formatEgp(item.priceMinor * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <dl className="mt-5 flex flex-col gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-600">
          <div className="flex items-center justify-between">
            <dt>Items</dt>
            <dd className="font-medium text-zinc-900">
              {formatEgp(subtotalMinor)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>Delivery</dt>
            <dd className="font-medium text-zinc-900">Free</dd>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-3 text-base">
            <dt className="font-medium text-zinc-900">Total</dt>
            <dd className="font-semibold text-zinc-900">
              {formatEgp(subtotalMinor)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-zinc-500">
          Prices and stock are confirmed by Gifto when you place the order. If
          an item sold out in the meantime, the order is not placed and you can
          adjust your cart.
        </p>
      </aside>
    </div>
  );
}
