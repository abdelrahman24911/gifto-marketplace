import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What information Gifto handles, why it is needed, and the choices available to you.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy policy"
      eyebrow="Legal"
      intro="A plain-language draft of how Gifto handles personal information across the marketplace."
      reviewItems={[
        "The legal entity name, registered address, and data-controller contact details.",
        "Approved retention periods for accounts, orders, vendor records, and support messages.",
        "The final process and response time for access, correction, and deletion requests.",
        "Approved international-transfer and processor disclosures.",
      ]}
    >
      <PolicySection title="Scope">
        <p>
          This policy covers the Gifto marketplace, including customer accounts,
          shop accounts, product browsing, carts, orders, and support. Shops also
          handle information needed to prepare and deliver their own orders, and
          their own notices may apply.
        </p>
        <p>
          This page is not yet the final published policy. The owner and a
          qualified legal adviser must confirm the remaining details before the
          draft notice is removed.
        </p>
      </PolicySection>

      <PolicySection title="Information Gifto handles">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Account and sign-in information, such as your name, email address,
            and authentication records.
          </li>
          <li>
            Order and delivery information, such as the recipient name, phone
            number, delivery address, order contents, and delivery notes.
          </li>
          <li>
            Shop information for seller accounts, including shop profile,
            products, stock, and order handling records.
          </li>
          <li>
            Support and communications content you send to Gifto or a shop in
            connection with an order.
          </li>
          <li>
            Technical and security information needed to run and protect the
            service, such as request logs and essential session data.
          </li>
          <li>
            Browser storage used to keep your cart and similar preferences on
            your device.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="Why it is used">
        <ul className="list-disc space-y-2 pl-5">
          <li>To create and secure accounts and keep you signed in.</li>
          <li>To show products, stock, prices, and shop information.</li>
          <li>
            To pass an order to the relevant shop and support fulfilment,
            delivery, and after-sales questions.
          </li>
          <li>
            To prevent fraud, abuse, and unauthorised access, and to keep the
            service reliable.
          </li>
          <li>
            To respond to support requests and meet applicable legal and
            accounting obligations.
          </li>
          <li>To understand and improve how the marketplace works.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Who receives it">
        <p>
          Information is shared only where it is needed to run the service:
          with the shop or shops fulfilling your order, with infrastructure
          providers that host the marketplace and its database and
          authentication, and with authorities or advisers where the law
          requires it.
        </p>
        <p>
          Gifto does not currently sell customer personal information. Any
          advertising or analytics tool that is added later must be reflected in
          this policy and, where required, in a consent choice.
        </p>
      </PolicySection>

      <PolicySection title="Payments and cookies">
        <p>
          Gifto currently offers cash on delivery, so the marketplace does not
          collect card details. If online payment is introduced, this policy will
          be updated before it is used.
        </p>
        <p>
          The storefront uses essential storage for sign-in sessions and your
          cart. Optional analytics or marketing cookies are not part of this
          policy today. If optional cookies are introduced, Gifto will provide
          the required information and choices first.
        </p>
      </PolicySection>

      <PolicySection title="Retention and your choices">
        <p>
          Information is kept only as long as it is needed for the purposes
          above, including order, tax, fraud-prevention, and dispute-handling
          requirements. The exact periods are still awaiting owner approval.
        </p>
        <p>
          Depending on the law that applies, you may be able to ask for access,
          correction, or deletion of your information, or object to some uses.
          The final policy will explain how to make a request and how it will be
          handled.
        </p>
      </PolicySection>

      <PolicySection title="Contact">
        <p>
          Until the formal data-controller contact is published, use the{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            contact page
          </GuardedLink>{" "}
          for the support routes that are currently available. Do not send
          sensitive information until a secure channel is confirmed.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
