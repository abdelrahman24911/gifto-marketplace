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
        "Refund timing and the approved method for cash-on-delivery orders.",
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

      <PolicySection title="Returns within 7 days of delivery">
        <p>
          You can ask for a return within 7 days of delivery. An order from
          several shops is handled shop by shop: a return covers one
          shop&apos;s part of the order at a time.
        </p>
        <p>
          Gifto&apos;s team approves the request, and the shop inspects the
          returned gift. You pay the return courier, unless the gift is wrong
          or damaged — then the shop pays. A returned gift is checked before
          it goes back on sale; restocking is never automatic.
        </p>
        <p>
          Cash refunds cannot be reversed automatically; the refund method and
          timing for cash-on-delivery orders are still being finalised. Read
          the{" "}
          <GuardedLink
            href="/refund-policy"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            refund policy
          </GuardedLink>{" "}
          for what can be confirmed today.
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
          preparation process. Perishable gifts, flowers, food, cakes, and
          personalised products may not be returnable once prepared, except
          where the item is faulty, damaged, or different from what was
          ordered.
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
