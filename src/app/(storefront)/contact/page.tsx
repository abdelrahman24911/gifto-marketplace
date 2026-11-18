import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Contact us",
  description:
    "Find the right support route for shopping, order, and seller questions on Gifto.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <PolicyPage
      title="Contact us"
      eyebrow="Support"
      intro="Use the route that matches your question so it reaches the right person."
      status="Gifto's public support email, phone/WhatsApp number, business address, and support hours have not yet been supplied for publication. They must be added here by the owner before launch."
      reviewItems={[
        "Public support email address.",
        "Phone or WhatsApp support number and operating hours.",
        "Registered business name and address for the data-controller and legal notices.",
      ]}
    >
      <PolicySection title="Order and delivery questions">
        <p>
          For an existing order, sign in and open{" "}
          <GuardedLink
            href="/account/orders"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            My orders
          </GuardedLink>
          . Include the order number and a clear description of the issue. For
          delivery or product problems, keep the packaging and any photos that
          show the issue.
        </p>
      </PolicySection>

      <PolicySection title="Shopping and account help">
        <p>
          The{" "}
          <GuardedLink
            href="/help"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            Help centre
          </GuardedLink>{" "}
          explains browsing, checkout, delivery, and returns. If your question is
          about access to your account, use the password-reset option on the sign
          in page.
        </p>
      </PolicySection>

      <PolicySection id="seller-enquiries" title="Seller questions">
        <p>
          Gifto shops join by invitation and are reviewed before going live.
          Existing sellers should sign in to the vendor dashboard for product,
          stock, and order support.
        </p>
        <p>
          A public seller-enquiry channel is still being finalised. The owner
          must publish an application address or form before this page can accept
          new seller enquiries.
        </p>
      </PolicySection>

      <PolicySection title="Legal and privacy">
        <p>
          For privacy, terms, or refund questions, read the{" "}
          <GuardedLink
            href="/privacy"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            privacy policy
          </GuardedLink>
          ,{" "}
          <GuardedLink
            href="/terms"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            terms of use
          </GuardedLink>
          , and{" "}
          <GuardedLink
            href="/refund-policy"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            refund policy
          </GuardedLink>
          . Formal legal notices will be added once the owner confirms the
          business details.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
