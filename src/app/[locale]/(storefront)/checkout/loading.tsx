import { Skeleton } from "@/components/ui/skeleton";

/**
 * Checkout loading state (UX Batch 1). The page resolves the session and,
 * for Buy Now, the product, before the form renders; the skeleton keeps the
 * two-column form / summary shape visible instead of a blank page.
 */
export default function CheckoutLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10" aria-live="polite">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <Skeleton className="h-6 w-44" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-4 h-16 w-full rounded-xl" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
