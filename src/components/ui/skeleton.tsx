export function Skeleton({
  className = "",
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "light";
}) {
  return (
    <div
      className={`animate-pulse rounded-xl ${
        tone === "light" ? "bg-paper/20" : "bg-line/60"
      } ${className}`}
    />
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-line bg-paper-soft"
        >
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-2 h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShopGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-paper-soft p-5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function CategoryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-44 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function GiftFinderSkeleton() {
  return (
    <div className="grid gap-8 rounded-[2rem] border border-line bg-paper-soft p-6 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-10 w-4/5" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="h-11 w-full rounded-full sm:col-span-3" />
      </div>
    </div>
  );
}

export function OccasionGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-[13rem] grid-cols-[42%_58%] overflow-hidden rounded-[1.75rem] border border-line/70 bg-paper-soft sm:min-h-[13.5rem] sm:grid-cols-[40%_60%] lg:min-h-[14rem]"
        >
          <Skeleton className="h-full min-h-[13rem] w-full rounded-none sm:min-h-[13.5rem] lg:min-h-[14rem]" />
          <div className="flex min-w-0 flex-col p-4 sm:p-5">
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="mt-2 h-6 w-3/5" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-auto ml-auto h-10 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
