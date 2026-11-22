/**
 * Vendor help content. Every answer describes shipped behaviour in this
 * codebase — no placeholders, sample policies, or invented contact details.
 */

export const SUPPORT_FAQ_CATEGORIES = [
  "Orders",
  "Products & inventory",
  "Finance",
  "Analytics",
  "Store settings",
  "Account & access",
] as const;

export type SupportFaqCategory = (typeof SUPPORT_FAQ_CATEGORIES)[number];

export type SupportFaq = {
  id: string;
  category: SupportFaqCategory;
  question: string;
  answer: string;
};

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    id: "orders-confirm",
    category: "Orders",
    question: "How do I confirm or fulfil an order?",
    answer:
      "Open Orders, choose the shop line, and use the next step shown. Shop lines move placed → confirmed → shipped → delivered. Only owners and managers can advance an order; staff members see the same information read-only.",
  },
  {
    id: "orders-skip",
    category: "Orders",
    question: "Why can't I jump straight to delivered?",
    answer:
      "The database enforces each fulfilment stage in order, so a line cannot skip confirmed or shipped. This keeps stock movements and commission records consistent.",
  },
  {
    id: "orders-cancel",
    category: "Orders",
    question: "What happens when I cancel an order?",
    answer:
      "Cancelling a placed or confirmed line returns its items to stock. Once a line is shipped, use “Delivery failed — cancel and restock”. Cancelling is final and is shown to the customer as cancelled.",
  },
  {
    id: "orders-customer-cancel",
    category: "Orders",
    question: "Can a customer cancel after I confirm?",
    answer:
      "A customer can cancel before your shop confirms the line. After confirmation, the customer can no longer cancel it; your shop can still cancel with restock or continue to delivery.",
  },
  {
    id: "orders-status",
    category: "Orders",
    question: "What does “On the way” mean?",
    answer:
      "“On the way” is the shipped stage: you have handed the order to delivery. The next vendor action is “Mark as delivered”, or delivery failed if it cannot be completed.",
  },
  {
    id: "products-visibility",
    category: "Products & inventory",
    question: "Who can edit products?",
    answer:
      "Shop owners and managers can create and edit products and images. Staff members can view the dashboard but cannot write product changes.",
  },
  {
    id: "products-status",
    category: "Products & inventory",
    question: "Draft, active or archived — what's the difference?",
    answer:
      "Draft products are hidden from customers. Active products appear on Gifto while your shop is active. Archived products are retired and hidden everywhere, but their history stays intact.",
  },
  {
    id: "products-images",
    category: "Products & inventory",
    question: "What image rules apply?",
    answer:
      "Each product can have up to 8 photos, 5 MB each, in JPEG, PNG, WebP or AVIF. The first photo is used on cards and in search.",
  },
  {
    id: "stock-flow",
    category: "Products & inventory",
    question: "How does stock change?",
    answer:
      "Placing an order decrements stock, cancelling returns it, and manual adjustments are recorded in the movement history. Stock cannot go below zero.",
  },
  {
    id: "stock-low",
    category: "Products & inventory",
    question: "When is a product considered low in stock?",
    answer:
      "Active products at 5 units or fewer are highlighted on the dashboard and analytics stock alerts. Out-of-stock products show at 0.",
  },
  {
    id: "finance-when",
    category: "Finance",
    question: "When is commission recorded?",
    answer:
      "Commission is recorded when a shop line is delivered. The rate is the one stored when the customer placed the order, so later rate changes do not rewrite history.",
  },
  {
    id: "finance-reversed",
    category: "Finance",
    question: "Why is a commission entry reversed?",
    answer:
      "A returned line reverses its commission. Reversed commission is excluded from current balances and shown separately in the finance ledger.",
  },
  {
    id: "finance-payouts",
    category: "Finance",
    question: "How do payouts work?",
    answer:
      "This dashboard records Gifto's commission and settlement batches. Shop payouts themselves are handled directly by the Gifto team outside this dashboard.",
  },
  {
    id: "finance-states",
    category: "Finance",
    question: "What do the finance states mean?",
    answer:
      "Available to settle means earned and not yet batched. In open settlement means included in an open batch. Paid means the batch was recorded as paid. A voided batch releases its lines back to available.",
  },
  {
    id: "analytics-revenue",
    category: "Analytics",
    question: "Why doesn't revenue match gross sales?",
    answer:
      "Gross sales counts every shop line placed in the window. Recognised revenue counts delivered lines only. Open, cancelled and returned value are shown separately so the numbers reconcile.",
  },
  {
    id: "analytics-change",
    category: "Analytics",
    question: "Why did revenue change later?",
    answer:
      "Revenue is grouped by delivery date and only counts delivered lines. If a delivered line is later returned, it leaves recognised revenue and appears under returned value.",
  },
  {
    id: "analytics-sellers",
    category: "Analytics",
    question: "Why is a product missing from best sellers?",
    answer:
      "Best sellers use delivered shop lines only. A product that has only open, cancelled or returned lines will not appear until one of its lines is delivered.",
  },
  {
    id: "settings-who",
    category: "Store settings",
    question: "Who can edit store settings?",
    answer:
      "Only the shop owner can save the store profile, logo, cover, opening hours and preparation time. Managers and staff can view the page read-only. Shop status and commission are controlled by the Gifto team.",
  },
  {
    id: "settings-logo",
    category: "Store settings",
    question: "What are the logo and cover requirements?",
    answer:
      "Use a JPEG, PNG, WebP or AVIF image up to 5 MB. Square logos and wide cover images look best. Both appear on your public shop page, and the logo also appears on shop cards.",
  },
  {
    id: "settings-profile",
    category: "Store settings",
    question: "Can I set my address, working hours and preparation time?",
    answer:
      "Yes. Owners can save a private street address, per-day opening hours and a preparation range from 0 to 60 days. The street address is visible only to your shop members and Gifto admins; working hours and preparation time are public.",
  },
  {
    id: "account-locked",
    category: "Account & access",
    question: "Why can't I open my shop dashboard?",
    answer:
      "The dashboard only opens for active shops. Pending, suspended and rejected shops stay on the Account page, where the status and next step are shown.",
  },
  {
    id: "account-switch",
    category: "Account & access",
    question: "How do I switch between shops?",
    answer:
      "Use the shop selector in the dashboard header. Navigation keeps the selected shop, so Orders, Finance, Analytics and Settings stay on the same shop.",
  },
  {
    id: "account-requests",
    category: "Account & access",
    question: "Can I open a support ticket here?",
    answer:
      "Yes. Use the request form on this page. It goes into the Gifto admin support queue for manual review, and its status appears under Recent requests. When email is configured, the shop's contact email also receives an update when the status changes; until then, check back here for updates.",
  },
];
