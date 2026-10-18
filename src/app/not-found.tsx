import Link from "next/link";

import { GiftoMark } from "@/components/icons";
import { Container } from "@/components/ui/section";

export default function NotFound() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <GiftoMark className="h-10 w-10" />
      <p className="mt-6 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
        404
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
        This gift isn&apos;t here
      </h1>
      <p className="mt-4 max-w-md text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-full bg-berry px-6 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
        >
          Back home
        </Link>
        <Link
          href="/shops"
          className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry"
        >
          Browse shops
        </Link>
        <Link
          href="/search"
          className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry"
        >
          Search gifts
        </Link>
      </div>
    </Container>
  );
}
