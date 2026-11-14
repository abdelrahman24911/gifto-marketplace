import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-72" />
          <Skeleton className="mt-6 h-10 w-full max-w-xl rounded-full" />
        </Container>
      </section>
      <Container className="pt-8">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-full" />
          ))}
        </div>
        <div className="mt-8">
          <ProductGridSkeleton />
        </div>
      </Container>
    </div>
  );
}
