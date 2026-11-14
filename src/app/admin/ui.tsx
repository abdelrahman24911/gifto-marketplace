import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowUpRightIcon } from "@/components/dashboard/icons";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 font-display text-4xl leading-none text-ink sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export type AdminStat = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: "default" | "warning" | "positive" | "accent" | "muted";
};

const STAT_EMPHASIS: Record<
  NonNullable<AdminStat["emphasis"]>,
  string
> = {
  default: "bg-paper-soft",
  warning: "bg-warning-soft",
  positive: "bg-success-soft",
  accent: "bg-berry-soft",
  muted: "bg-paper",
};

export function AdminStatStrip({ items }: { items: AdminStat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`min-w-0 px-4 py-4 sm:px-5 ${STAT_EMPHASIS[item.emphasis ?? "default"]}`}
        >
          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            {item.label}
          </dt>
          <dd className="mt-1 break-words font-display text-2xl leading-tight tabular-nums text-ink">
            {item.value}
          </dd>
          {item.hint ? (
            <p className="mt-1 text-xs leading-snug text-ink-soft">
              {item.hint}
            </p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function AdminSectionHeading({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl leading-tight text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-ink-mute">
            {description}
          </p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-berry transition-colors hover:text-berry-deep"
        >
          {linkLabel}
          <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

const NOTICE_STYLES = {
  warning: "border-warning/30 bg-warning-soft text-ink",
  danger: "border-danger/25 bg-danger-soft text-ink",
  success: "border-success/25 bg-success-soft text-ink",
  info: "border-line-strong bg-paper-soft text-ink-soft",
} as const;

export function AdminNotice({
  tone = "warning",
  role,
  children,
}: {
  tone?: keyof typeof NOTICE_STYLES;
  role?: "alert" | "status" | "note";
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${NOTICE_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}

export function AdminFilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/35 ${
        active
          ? "border-ink bg-ink text-paper"
          : "border-line-strong bg-paper-soft text-ink-soft hover:border-berry/40 hover:text-berry-deep"
      }`}
    >
      {children}
    </Link>
  );
}

export function AdminActionLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          : "inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
      }
    >
      {children}
    </Link>
  );
}
