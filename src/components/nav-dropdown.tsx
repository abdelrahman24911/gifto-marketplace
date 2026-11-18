"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ArrowRightIcon, ChevronDownIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import type { StoreNavLink } from "@/lib/site-navigation";

export function NavDropdown({
  label,
  href,
  items,
  columns = 1,
  active = false,
}: {
  label: string;
  href: string;
  items: StoreNavLink[];
  columns?: 1 | 2;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const triggerClass = `rounded-full px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-berry-soft text-berry-deep"
      : "text-ink-soft hover:bg-berry-soft hover:text-berry-deep"
  }`;

  return (
    <div ref={containerRef} className="relative flex items-center">
      <GuardedLink
        href={href}
        className={`${triggerClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry`}
        aria-current={active ? "page" : undefined}
      >
        {label}
      </GuardedLink>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? "Close" : "Open"} ${label} menu`}
        className={`inline-flex h-8 w-7 items-center justify-center rounded-full transition-colors ${
          active
            ? "text-berry-deep hover:bg-berry-tint"
            : "text-ink-mute hover:bg-berry-soft hover:text-berry-deep"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry`}
      >
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className={`absolute left-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-34px_oklch(0.28_0.03_40/0.45)] ${
            columns === 2 ? "w-[23rem]" : "w-64"
          }`}
        >
          <div
            className={`grid gap-1 p-2 ${
              columns === 2 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {items.length > 0 ? (
              items.map((item) => (
                <GuardedLink
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  {item.label}
                </GuardedLink>
              ))
            ) : (
              <p className="col-span-full px-3 py-2 text-sm text-ink-mute">
                Nothing published yet.
              </p>
            )}
          </div>
          <GuardedLink
            href={href}
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-3 border-t border-line bg-paper-soft/70 px-4 py-3 text-sm font-medium text-berry transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            View all {label.toLowerCase()}
            <ArrowRightIcon className="h-4 w-4" />
          </GuardedLink>
        </div>
      ) : null}
    </div>
  );
}
