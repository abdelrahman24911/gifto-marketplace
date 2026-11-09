"use client";

import { useMemo, useState } from "react";

import {
  SUPPORT_FAQ_CATEGORIES,
  type SupportFaq,
  type SupportFaqCategory,
} from "@/lib/support-content";

type CategoryFilter = SupportFaqCategory | "all";

export function SupportFaqSearch({ faqs }: { faqs: SupportFaq[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return faqs.filter((faq) => {
      if (category !== "all" && faq.category !== category) return false;
      if (!normalized) return true;
      return (
        faq.question.toLowerCase().includes(normalized) ||
        faq.answer.toLowerCase().includes(normalized) ||
        faq.category.toLowerCase().includes(normalized)
      );
    });
  }, [category, faqs, normalized]);

  const grouped = useMemo(() => {
    return SUPPORT_FAQ_CATEGORIES.flatMap((name) => {
      const items = filtered.filter((faq) => faq.category === name);
      return items.length > 0 ? [{ name, items }] : [];
    });
  }, [filtered]);

  const countLabel = `${filtered.length} ${
    filtered.length === 1 ? "answer" : "answers"
  }`;

  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          Search help
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “cancel”, “commission”, “logo”…"
            className="w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-1 focus:ring-berry"
          />
        </label>

        <div
          role="group"
          aria-label="Filter help by topic"
          className="flex flex-wrap gap-1.5"
        >
          <button
            type="button"
            onClick={() => setCategory("all")}
            aria-pressed={category === "all"}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              category === "all"
                ? "border-berry bg-berry text-paper"
                : "border-line-strong bg-paper text-ink-soft hover:border-berry/40 hover:text-berry"
            }`}
          >
            All topics
          </button>
          {SUPPORT_FAQ_CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              aria-pressed={category === name}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                category === name
                  ? "border-berry bg-berry text-paper"
                  : "border-line-strong bg-paper text-ink-soft hover:border-berry/40 hover:text-berry"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-mute" aria-live="polite">
        {countLabel}
        {normalized ? ` matching “${query.trim()}”` : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
          No answers match that search. Try a broader term such as “order”,
          “stock” or “price”.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {grouped.map((group) => (
            <section key={group.name} aria-labelledby={`faq-${group.name}`}>
              <h3
                id={`faq-${group.name}`}
                className="text-xs font-semibold uppercase tracking-wide text-ink-mute"
              >
                {group.name}
              </h3>
              <ul className="mt-2 flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {group.items.map((faq) => (
                  <li key={faq.id}>
                    <details className="group px-4 py-3">
                      <summary className="cursor-pointer list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/40">
                        <span className="flex items-start justify-between gap-3">
                          {faq.question}
                          <span
                            aria-hidden
                            className="mt-0.5 shrink-0 text-ink-mute transition-transform group-open:rotate-45"
                          >
                            +
                          </span>
                        </span>
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                        {faq.answer}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
