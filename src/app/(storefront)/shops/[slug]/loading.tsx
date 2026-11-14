import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ShopLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Skeleton className="h-4 w-40" />
          <div className="mt-6 flex items-start gap-5">
            <Skeleton className="h-16 w-16 rounded-2xl" />
            <div className="flex-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-12 w-72" />
              <Skeleton className="mt-4 h-4 w-40" />
            </div>
          </div>
        </Container>
      </section>
      <Container className="pt-10">
        <Skeleton className="mb-6 h-8 w-56" />
        <ProductGridSkeleton />
      </Container>
    </div>
  );
}
