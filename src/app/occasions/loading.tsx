import { Container } from "@/components/ui/section";
import { CategoryGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function OccasionsLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-4 h-12 w-80" />
          <Skeleton className="mt-5 h-4 w-full max-w-xl" />
        </Container>
      </section>
      <Container className="pt-10">
        <CategoryGridSkeleton />
      </Container>
    </div>
  );
}
