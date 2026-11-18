import type { ReactNode } from "react";

import { ArrowRightIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";

/** Consistent page gutter + max width for storefront sections. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-ink-soft">{description}</p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <GuardedLink
          href={href}
          className="group inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-berry hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          {linkLabel}
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </GuardedLink>
      ) : null}
    </div>
  );
}

/** Dashed empty-state panel used when a section has no real data yet. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-paper-soft px-6 py-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-md break-words text-sm text-ink-soft">
          {children}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Section-level failure state. Catalogue reads distinguish an empty result
 * from a failed read, so the homepage can say "try again" instead of pretending
 * the catalogue is empty.
 */
export function SectionError({
  title = "We couldn't load this section",
  children = "Refresh the page to try again.",
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-line-strong bg-paper-soft px-6 py-10 text-center"
    >
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md break-words text-sm text-ink-soft">
        {children}
      </p>
      <a
        href=""
        className="mt-4 inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-sm font-medium text-berry transition-colors hover:border-berry/40 hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
      >
        Try again
      </a>
    </div>
  );
}

/** Text breadcrumb. The final item is the current page (not a link). */
export function Breadcrumb({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-mute">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href ? (
              <GuardedLink
                href={item.href}
                className="transition-colors hover:text-berry"
              >
                {item.label}
              </GuardedLink>
            ) : (
              <span className="text-ink-soft">{item.label}</span>
            )}
            {index < items.length - 1 ? (
              <span aria-hidden className="text-line-strong">
                /
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
