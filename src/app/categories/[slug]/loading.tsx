import { Container } from "@/components/ui/section";
import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-6 h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-72" />
          <Skeleton className="mt-5 h-4 w-full max-w-xl" />
        </Container>
      </section>
      <Container className="pt-10">
        <Skeleton className="mb-6 h-8 w-56" />
        <ProductGridSkeleton />
      </Container>
    </div>
  );
}
