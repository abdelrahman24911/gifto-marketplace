import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Refund policy",
  description:
    "The draft approach to cancellations, damaged gifts, and refunds on Gifto.",
  path: "/refund-policy",
});

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      title="Refund policy"
      eyebrow="Legal"
      intro="The working approach to cancellations and refunds when a Gifto order does not go to plan."
      reviewItems={[
        "Owner-approved eligibility rules for cancellations, refunds, and replacements.",
        "Refund timing and the approved method for cash-on-delivery orders.",
        "Who bears return-delivery costs and how damaged items are assessed.",
        "The formal escalation route if a shop and customer cannot agree.",
      ]}
    >
      <PolicySection title="This policy is still being finalised">
        <p>
          Gifto shops fulfil their own orders. Refund and replacement decisions
          therefore depend on the product, its condition, and how far the shop has
          progressed with preparation. The final policy must be approved before
          it can be treated as a promise of a specific outcome.
        </p>
      </PolicySection>

      <PolicySection title="Before the gift is delivered">
        <p>
          Contact the shop as soon as possible if you need to change or cancel an
          order. Whether a cancellation is possible depends on whether the gift
          has been prepared, personalised, or dispatched. Nothing in this draft
          guarantees cancellation after preparation has started.
        </p>
      </PolicySection>

      <PolicySection title="Damaged, wrong, or missing gifts">
        <p>
          If something is wrong with a delivered order, keep the packaging and
          take clear photos where possible. Raise the issue through the order
          details or the shop promptly, before the product is used or discarded.
          This helps the shop investigate with its courier and supplier.
        </p>
        <p>
          Where a refund or replacement is agreed, the final method and timing
          will depend on the payment method and the shop&apos;s process. Cash
          orders cannot be reversed automatically; the owner must approve and
          publish a practical refund method.
        </p>
      </PolicySection>

      <PolicySection title="Products with limited return options">
        <p>
          Perishable gifts, flowers, food, cakes, and personalised products may
          not be returnable once prepared, except where the item is faulty,
          damaged, or different from what was ordered. The final policy will set
          out any approved exceptions and the evidence required.
        </p>
      </PolicySection>

      <PolicySection title="What to do next">
        <p>
          Start with the order in{" "}
          <GuardedLink
            href="/account/orders"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            My orders
          </GuardedLink>{" "}
          so the shop has the correct order reference. The{" "}
          <GuardedLink
            href="/delivery-returns"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            delivery and returns guide
          </GuardedLink>{" "}
          explains the current process.
        </p>
        <p>
          If a shop and customer cannot agree, the final policy will explain how
          the issue is escalated to Gifto. A public escalation channel is still
          being finalised; see the{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            contact page
          </GuardedLink>{" "}
          for the routes available today.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
