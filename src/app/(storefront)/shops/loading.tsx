import { Container } from "@/components/ui/section";
import { ShopGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ShopsLoading() {
  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-4 h-12 w-72" />
          <Skeleton className="mt-5 h-4 w-full max-w-xl" />
        </Container>
      </section>
      <Container className="pt-10">
        <ShopGridSkeleton />
      </Container>
    </div>
  );
}
