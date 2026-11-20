import type { DashboardNavGroup } from "@/components/dashboard/types";

export const vendorNavGroups: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Overview",
        href: "/vendor/overview",
        icon: "overview",
        exact: true,
      },
    ],
  },
  {
    label: "Shop management",
    items: [
      { label: "Orders", href: "/vendor/orders", icon: "orders" },
      { label: "Products", href: "/vendor/products", icon: "products" },
      { label: "Inventory", href: "/vendor/inventory", icon: "inventory" },
      { label: "Refunds", href: "/vendor/refunds", icon: "support" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Finance", href: "/vendor/finance", icon: "earnings" },
      { label: "Analytics", href: "/vendor/analytics", icon: "analytics" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Store settings", href: "/vendor/settings", icon: "settings" },
      { label: "Help & support", href: "/vendor/support", icon: "help" },
    ],
  },
];
