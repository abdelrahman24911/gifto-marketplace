import type { ReactNode } from "react";

import { GuardedLink } from "@/components/navigation-guard";
import { Breadcrumb, Container, Eyebrow } from "@/components/ui/section";

export function PolicySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-8 first:border-0 first:pt-0">
      <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

export function PolicyPage({
  title,
  intro,
  eyebrow = "Help & policies",
  status,
  reviewItems = [],
  children,
}: {
  title: string;
  intro: string;
  eyebrow?: string;
  status?: string;
  reviewItems?: string[];
  children: ReactNode;
}) {
  return (
    <div className="pb-12">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-10 sm:py-14">
          <Breadcrumb items={[{ href: "/", label: "Home" }, { label: title }]} />
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            {intro}
          </p>

          <div
            role="note"
            className="mt-7 max-w-3xl rounded-2xl border border-gold/45 bg-gold-soft/35 p-5"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-berry-deep">
              Publishing status
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {status ??
                "This page is published for launch transparency. Gifto's owner and legal adviser must approve the final wording before it is treated as a final policy."}
            </p>
            {reviewItems.length > 0 ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                  Details still needed from the owner
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {reviewItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </Container>
      </section>

      <Container className="pt-9">
        <article className="max-w-3xl space-y-8">{children}</article>
        <div className="mt-10 max-w-3xl border-t border-line pt-6">
          <GuardedLink
            href="/help"
            className="text-sm font-medium text-berry underline-offset-4 transition-colors hover:text-berry-deep hover:underline"
          >
            Back to the Help Centre
          </GuardedLink>
        </div>
      </Container>
    </div>
  );
}
