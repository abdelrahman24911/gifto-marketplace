import type { MatchingPreviewLoad } from "./matching-data";

const TITLE_ID = "matching-preview-title";

export function MatchingPreview({
  preview,
  occasionIsActive,
}: {
  preview: MatchingPreviewLoad;
  occasionIsActive: boolean;
}) {
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="mt-10 rounded-2xl border border-line bg-paper-soft p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-berry">
            Same rules as the storefront
          </p>
          <h2
            id={TITLE_ID}
            className="mt-2 font-display text-3xl leading-tight text-ink"
          >
            Public collection preview
          </h2>
        </div>
        {preview.ok ? (
          <p className="rounded-full border border-line-strong bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">
            {preview.data.total.toLocaleString("en-US")}{" "}
            {preview.data.total === 1 ? "product" : "products"}
          </p>
        ) : null}
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
        This preview uses the database matching rules and shows only active
        products from visible shops. Manual picks lead in hybrid mode;
        category and tag matches follow.
        {occasionIsActive
          ? ""
          : " The occasion is hidden, so this is what would appear after publishing."}
      </p>

      {!preview.ok ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {preview.error}
        </p>
      ) : preview.data.items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-6 text-center text-sm text-ink-mute">
          No products match yet. Add manual picks or choose active category and
          tag rules.
        </p>
      ) : (
        <div className="mt-4">
          <ol className="divide-y divide-line rounded-xl border border-line bg-paper">
            {preview.data.items.map((item, index) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    <span className="mr-2 font-mono text-xs text-ink-mute">
                      {index + 1}.
                    </span>
                    {item.name}
                  </p>
                  {item.vendorName ? (
                    <p className="mt-0.5 pl-6 text-xs text-ink-mute">
                      {item.vendorName}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                    item.isManual
                      ? "border-berry/25 bg-berry-soft text-berry-deep"
                      : "border-line-strong bg-paper-soft text-ink-soft"
                  }`}
                >
                  {item.isManual ? "Manual pick" : "Automatic match"}
                </span>
              </li>
            ))}
          </ol>
          {preview.data.total > preview.data.items.length ? (
            <p className="mt-2 px-1 text-xs text-ink-mute">
              Showing the first {preview.data.items.length} of{" "}
              {preview.data.total.toLocaleString("en-US")} products.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
