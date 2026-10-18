import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="pb-4">
      <section className="border-b border-line">
        <Container className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-5 h-14 w-full max-w-xl" />
            <Skeleton className="mt-3 h-14 w-4/5 max-w-lg" />
            <Skeleton className="mt-6 h-4 w-full max-w-lg" />
            <Skeleton className="mt-3 h-4 w-2/3 max-w-md" />
            <div className="mt-8 flex gap-3">
              <Skeleton className="h-12 w-40 rounded-full" />
              <Skeleton className="h-12 w-36 rounded-full" />
            </div>
          </div>
          <Skeleton className="mx-auto hidden aspect-[4/5] w-full max-w-sm rounded-[2.5rem] lg:block" />
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <Skeleton className="h-8 w-56" />
          <div className="mt-8">
            <ProductGridSkeleton count={4} />
          </div>
        </Container>
      </section>
    </div>
  );
}
