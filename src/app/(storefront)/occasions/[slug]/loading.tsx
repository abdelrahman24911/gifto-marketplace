import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function OccasionLoading() {
  return (
    <div className="pb-10">
      <section className="border-b border-line/60 bg-gradient-to-br from-paper via-paper-soft to-berry-soft">
        <Container className="py-7 sm:py-9 lg:py-12">
          <Skeleton className="h-4 w-56" />
          <div className="mt-5 grid gap-5 md:grid-cols-[1.02fr_0.98fr] md:items-center md:gap-8 lg:gap-12">
            <div>
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="mt-4 h-14 w-4/5 max-w-md" />
              <Skeleton className="mt-4 h-4 w-full max-w-xl" />
              <Skeleton className="mt-2 h-4 w-2/3 max-w-md" />
            </div>
            <Skeleton className="h-32 w-full rounded-[1.5rem] sm:h-44 md:aspect-[4/3] md:h-auto md:rounded-[1.75rem]" />
          </div>
        </Container>
      </section>

      <Container className="pt-8 sm:pt-10">
        <div className="mb-5 flex items-baseline gap-3 border-b border-line pb-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <ProductGridSkeleton />
      </Container>
    </div>
  );
}
