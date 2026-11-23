"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent, type ReactNode } from "react";

import { shouldInterceptLinkClick } from "@/lib/navigation";

/**
 * A filter pill that shows it is working while the new list loads.
 *
 * Filter changes are search-param-only navigations on the same route, and
 * loading.tsx does not re-trigger for those — so a plain Link left the old
 * list on screen with no feedback until the new data arrived, and users
 * clicked again. This pill intercepts plain left-clicks with router.push
 * inside a transition and stays dimmed with a spinner until the new route
 * renders. Modifier/middle clicks keep their normal browser behaviour.
 */
export function FilterPill({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldInterceptLinkClick(event)) return;
    event.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-busy={pending || undefined}
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 ${className} ${pending ? "opacity-60" : ""}`}
    >
      {pending ? (
        <svg
          aria-hidden
          className="h-3.5 w-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : null}
      {children}
    </Link>
  );
}
