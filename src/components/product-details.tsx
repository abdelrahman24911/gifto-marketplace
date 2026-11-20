"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type ProductTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function ProductDetails({
  tabs,
  ariaLabel,
}: {
  tabs: ProductTab[];
  ariaLabel: string;
}) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");

  if (tabs.length === 0) return null;

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (tabs.length === 1) {
    return (
      <section className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-7">
        <h2 className="font-display text-2xl text-ink">{active.label}</h2>
        <div className="mt-4">{active.content}</div>
      </section>
    );
  }

  function tabId(id: string): string {
    return `${baseId}-tab-${id}`;
  }

  function panelId(id: string): string {
    return `${baseId}-panel-${id}`;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const index = tabs.findIndex((tab) => tab.id === active.id);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;

    event.preventDefault();
    const next = tabs[nextIndex];
    setActiveId(next.id);
    document.getElementById(tabId(next.id))?.focus();
  }

  return (
    <section className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-7">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={handleKeyDown}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${
                selected
                  ? "bg-berry text-paper shadow-sm"
                  : "text-ink-soft hover:bg-berry-soft hover:text-berry-deep"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={tabId(tab.id)}
          hidden={tab.id !== active.id}
          className="mt-5"
        >
          {tab.id === active.id ? tab.content : null}
        </div>
      ))}
    </section>
  );
}
