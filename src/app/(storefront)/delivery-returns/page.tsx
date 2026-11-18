import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Delivery & returns",
  description:
    "How delivery, order issues, and returns work when you buy from a Gifto shop.",
  path: "/delivery-returns",
});

export default function DeliveryReturnsPage() {
  return (
    <PolicyPage
      title="Delivery & returns"
      eyebrow="Support"
      intro="How gifts reach you, and what to do if something is wrong with the order."
      reviewItems={[
        "The owner-approved delivery and returns process, including who pays return delivery.",
        "The public support channel and response-time expectations.",
      ]}
    >
      <PolicySection title="Who delivers the gift">
        <p>
          Each shop wraps, packs, and arranges delivery for its own products.
          The shop sets the delivery area, timeframe, and any delivery fee shown
          at checkout.
        </p>
        <p>
          If one order contains gifts from several shops, each shop may deliver
          separately and may have its own preparation time.
        </p>
      </PolicySection>

      <PolicySection title="Before delivery">
        <p>
          Check the delivery address and phone number before confirming an
          order. Contact the shop as soon as possible if the address, recipient,
          or delivery instructions change.
        </p>
        <p>
          Whether an order can still be changed or cancelled depends on how far
          the shop has progressed. Preparation and cancellation rules are
          confirmed by the shop for each order.
        </p>
      </PolicySection>

      <PolicySection title="If something is wrong">
        <p>
          If a gift arrives damaged, is not what you ordered, or does not arrive,
          keep the packaging and any delivery evidence. Raise the issue through
          the order details or the shop as soon as possible so it can be
          investigated.
        </p>
        <p>
          Return eligibility depends on the product and the shop&apos;s
          preparation process. A final returns policy is awaiting owner approval;
          read the{" "}
          <GuardedLink
            href="/refund-policy"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            refund policy
          </GuardedLink>{" "}
          for what can be confirmed today.
        </p>
      </PolicySection>

      <PolicySection title="Perishable and personalised gifts">
        <p>
          Cakes, flowers, food gifts, and personalised items may have limited
          return options once preparation has started. The shop&apos;s product
          page and order confirmation are the place to check specific handling
          details.
        </p>
      </PolicySection>

      <PolicySection title="Need to raise an issue?">
        <p>
          Open{" "}
          <GuardedLink
            href="/account/orders"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            My orders
          </GuardedLink>{" "}
          when signed in, or visit{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            Contact us
          </GuardedLink>{" "}
          for the available support routes.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
