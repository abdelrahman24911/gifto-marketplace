import type { Metadata } from "next";

import { GuardedLink } from "@/components/navigation-guard";
import { PolicyPage, PolicySection } from "@/components/policy-page";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description:
    "The draft marketplace rules for shopping, selling, and using Gifto.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of use"
      eyebrow="Legal"
      intro="The working rules for using the Gifto marketplace as a customer or a shop."
      reviewItems={[
        "The legal entity operating Gifto, its registered address, and formal notice details.",
        "Final liability, dispute-resolution, governing-law, and jurisdiction wording.",
        "Approved order-cancellation, suspension, and account-closure rules.",
        "The final process for reporting unlawful or infringing content.",
      ]}
    >
      <PolicySection title="Draft terms">
        <p>
          These terms are a working draft published for transparency. They are not
          yet final legal terms and must be approved by the owner and a qualified
          legal adviser before launch. Do not rely on this page as a completed
          contract.
        </p>
      </PolicySection>

      <PolicySection title="Gifto's role">
        <p>
          Gifto provides a marketplace where independent shops list and sell
          gifts. Each shop is responsible for its products, descriptions,
          prices, stock, preparation, packaging, and delivery. A contract for a
          product is between you and the shop that fulfils it.
        </p>
        <p>
          Gifto reviews shops before they become public and provides the platform
          for browsing, ordering, and order records, but does not become the
          manufacturer or delivery company.
        </p>
      </PolicySection>

      <PolicySection title="Accounts">
        <p>
          Provide accurate information, keep your sign-in credentials secure, and
          tell Gifto promptly if you believe your account has been misused. You
          are responsible for activity carried out through your account, subject
          to applicable law.
        </p>
        <p>
          Shop accounts must only be used by people authorised by that shop.
          Gifto may investigate and restrict accounts where there is suspected
          fraud, abuse, or a breach of these terms.
        </p>
      </PolicySection>

      <PolicySection title="Orders and prices">
        <p>
          Product pages show the current listed price. The final total, stock
          availability, and delivery details are checked again when the order is
          placed. If a shop cannot fulfil an order, it should contact you through
          the order details to explain the available options.
        </p>
        <p>
          Gifto currently offers cash on delivery only. You are responsible for
          providing a complete and reachable delivery address and phone number.
        </p>
      </PolicySection>

      <PolicySection title="Acceptable use">
        <p>
          Do not use Gifto to break the law, commit fraud, interfere with the
          service, attempt unauthorised access, scrape personal information, or
          upload content that you do not have the right to use. Do not post
          misleading product information, impersonate another person or shop, or
          misuse another customer&apos;s order details.
        </p>
      </PolicySection>

      <PolicySection title="Content and intellectual property">
        <p>
          The Gifto name, site design, and platform content belong to Gifto or its
          licensors. Shop names, product photos, descriptions, and other shop
          content belong to the relevant shop or rights holder. Shops grant Gifto
          the permission needed to display and promote that content on the
          marketplace.
        </p>
        <p>
          A final process for reporting infringing content will be added after
          legal review.
        </p>
      </PolicySection>

      <PolicySection title="Availability and liability">
        <p>
          Gifto aims to keep the marketplace accurate and available, but cannot
          promise uninterrupted access or that every shop listing will always be
          available. The final terms will set out the allocation of
          responsibility between Gifto and shops, subject to rights that cannot
          be excluded by law.
        </p>
      </PolicySection>

      <PolicySection title="Changes and contact">
        <p>
          Gifto may update the service and these terms as the marketplace
          develops. Material changes will be presented on the marketplace before
          they take effect. The final terms will identify the governing law and
          how disputes are handled.
        </p>
        <p>
          Questions about these draft terms can be raised through the{" "}
          <GuardedLink
            href="/contact"
            className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
          >
            contact page
          </GuardedLink>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
