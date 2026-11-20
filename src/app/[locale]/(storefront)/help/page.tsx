import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Help centre",
  description:
    "Get help with browsing, ordering, delivery, returns, and selling on Gifto.",
  path: "/help",
});

export default function HelpPage() {
  return (
    <PolicyPage
      title="Help centre"
      eyebrow="Support"
      intro="Straight answers about shopping on Gifto, following an order, and selling through the marketplace."
      status="These support notes describe how Gifto works today. Support contact channels and some seller-onboarding details are still being finalised by the owner."
      reviewItems={[
        "The public support email, phone or WhatsApp number, and support hours.",
        "The final seller-onboarding and invitation process.",
      ]}
    >
      <PolicySection title="Shopping on Gifto">
        <p>
          Browse by occasion, category, shop, or search. Gift Finder narrows the
          live catalogue by recipient, moment, and budget. No account is needed
          to browse.
        </p>
        <p>
          Prices are shown in Egyptian pounds. Stock and the final total are
          checked again when you place the order.
        </p>
      </PolicySection>

      <PolicySection title="Placing an order">
        <p>
          Add a gift to your cart, continue to checkout, and enter the delivery
          details. Gifto currently supports cash on delivery only. You will see
          the delivery amount, if any, before you confirm.
        </p>
        <p>
          Orders are fulfilled by the individual shop. If your cart contains
          gifts from more than one shop, those shops may deliver separately.
        </p>
      </PolicySection>

      <PolicySection title="Following or changing an order">
        <p>
          Sign in and open{" "}
          <GuardedLink
            href="/account/orders"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            My orders
          </GuardedLink>{" "}
          to see the latest status. Order-specific questions should be raised
          with the shop as early as possible.
        </p>
      </PolicySection>

      <PolicySection title="Delivery and returns">
        <p>
          Delivery areas, timing, fees, and any product exceptions are set by
          each shop and shown before checkout. Read the{" "}
          <GuardedLink
            href="/delivery-returns"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            delivery and returns guide
          </GuardedLink>{" "}
          and the{" "}
          <GuardedLink
            href="/refund-policy"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            refund policy
          </GuardedLink>{" "}
          for the current process.
        </p>
      </PolicySection>

      <PolicySection
        id="selling-on-gifto"
        title="Selling on Gifto"
      >
        <p>
          Shops join by invitation and are reviewed before their products become
          public. Active sellers can sign in to manage products, stock, orders,
          and shop settings from the vendor dashboard.
        </p>
        <p>
          Seller onboarding materials are not yet published. To register interest
          or ask about an invitation, use the{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            contact page
          </GuardedLink>
          .
        </p>
      </PolicySection>

      <PolicySection title="Still need help?">
        <p>
          Visit{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            Contact us
          </GuardedLink>{" "}
          for the support channels that are currently available.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
