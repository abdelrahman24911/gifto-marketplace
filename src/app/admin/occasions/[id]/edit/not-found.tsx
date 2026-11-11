import Link from "next/link";

export default function OccasionNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-dashed border-line-strong bg-paper-soft px-6 py-12 text-center">
        <p className="font-display text-xl text-ink">Occasion not found</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          This occasion may have been deleted, or the address is incorrect.
        </p>
        <Link
          href="/admin/occasions"
          className="mt-5 inline-flex rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
        >
          Back to occasions
        </Link>
      </div>
    </div>
  );
}
