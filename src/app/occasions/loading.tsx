import { Container } from "@/components/ui/section";
import {
  OccasionGridSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function OccasionsLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line/60 bg-gradient-to-br from-paper via-paper-soft to-berry-soft">
        <Container className="grid items-center gap-2 py-8 sm:py-10 md:grid-cols-[1.05fr_0.95fr] md:gap-5 md:py-12 lg:gap-10 lg:py-14">
          <div>
            <Skeleton className="h-7 w-36 rounded-full" />
            <Skeleton className="mt-5 h-14 w-full max-w-md" />
            <Skeleton className="mt-3 h-14 w-4/5 max-w-sm" />
            <Skeleton className="mt-5 h-4 w-full max-w-lg" />
            <Skeleton className="mt-2 h-4 w-3/4 max-w-md" />
          </div>
          <Skeleton className="hidden aspect-[4/3] w-full rounded-[2rem] md:block" />
        </Container>
      </section>

      <Container className="pt-8 sm:pt-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-12 w-full rounded-full sm:w-80" />
        </div>
        <OccasionGridSkeleton />
      </Container>
    </div>
  );
}
