import { ProductCard } from "@/components/product-card";
import type { CatalogProduct } from "@/lib/catalog";

export function ProductRail({ products }: { products: CatalogProduct[] }) {
  if (products.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          href={`/shops/${product.vendorSlug}/${product.slug}`}
          name={product.name}
          priceMinor={product.priceMinor}
          stock={product.stock}
          imagePath={product.imagePath}
          imageAlt={product.imageAlt}
          vendorName={product.vendorName}
          categoryName={product.categoryName}
        />
      ))}
    </div>
  );
}
