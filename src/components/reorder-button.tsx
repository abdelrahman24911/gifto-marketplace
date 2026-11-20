"use client";

import { useTranslations } from "next-intl";

import { useCart } from "@/components/cart-provider";
import { useToast } from "@/components/toast-provider";
import { useRouter } from "@/i18n/navigation";
import type { ReorderResolution } from "@/lib/reorder";

/**
 * "Order these again" for an order detail page. The resolution is
 * computed server-side against live prices and stock, so this button
 * only adds what is actually orderable today; anything skipped is
 * named in the toast, and the customer lands on the cart to review
 * before paying.
 */
export function ReorderButton({
  resolution,
}: {
  resolution: ReorderResolution;
}) {
  const t = useTranslations("order");
  const { addMany } = useCart();
  const { notify } = useToast();
  const router = useRouter();

  if (resolution.items.length === 0) {
    return (
      <p className="mt-3 text-sm text-zinc-500">{t("reorderUnavailable")}</p>
    );
  }

  function handleClick(): void {
    addMany(resolution.items);
    const parts = [
      t("reorderAdded", { count: resolution.items.length }),
    ];
    if (resolution.adjusted) parts.push(t("reorderAdjusted"));
    if (resolution.skipped.length > 0) {
      parts.push(
        t("reorderPartial", { skipped: resolution.skipped.join(", ") }),
      );
    }
    notify(parts.join(" "), "success");
    router.push("/cart");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-3 w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
    >
      {t("reorder")}
    </button>
  );
}
