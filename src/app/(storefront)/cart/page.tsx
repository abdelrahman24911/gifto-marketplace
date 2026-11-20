import { ProductRail } from "@/components/product-rail";
import { loadNewArrivals } from "@/lib/catalog";

import { CartView } from "./cart-view";

export const metadata = { title: "Cart — Gifto" };

export default async function CartPage() {
  const recommendations = await loadNewArrivals(4);

  return (
    <CartView
      emptyRecommendations={
        recommendations.ok && recommendations.data.length > 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Gift ideas to get you started
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              A few of the newest gifts from independent shops.
            </p>
            <div className="mt-4">
              <ProductRail products={recommendations.data} />
            </div>
          </div>
        ) : null
      }
    />
  );
}
