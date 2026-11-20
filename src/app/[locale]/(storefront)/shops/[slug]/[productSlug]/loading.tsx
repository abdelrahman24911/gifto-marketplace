import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Product detail loading state (UX Batch 1). The page fetches the shop and
 * the product from the database, so navigation here used to show a blank
 * shell until the whole page resolved; the skeleton keeps the gallery /
 * purchase-panel shape visible instead.
 */
export default function ProductLoading() {
  return (
    <div className="pb-8" aria-live="polite">
      <Container className="py-8 sm:py-10 lg:py-12">
        <Skeleton className="h-4 w-64" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
          <div className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
            <div className="flex gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-16 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-6 lg:p-7">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-4 h-9 w-4/5" />
              <Skeleton className="mt-4 h-8 w-32" />
              <Skeleton className="mt-6 h-12 w-full rounded-full" />
              <Skeleton className="mt-2.5 h-12 w-full rounded-full" />
            </div>
            <div className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-6">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          </div>
        </div>
        <div className="mt-10 lg:mt-14">
          <ProductGridSkeleton count={4} />
        </div>
      </Container>
    </div>
  );
}
