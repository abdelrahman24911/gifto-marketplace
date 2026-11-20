import type { DashboardNavGroup } from "@/components/dashboard/types";

export const adminNavGroups: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Overview",
        href: "/admin",
        icon: "overview",
        exact: true,
      },
      {
        label: "Analytics",
        href: "/admin/analytics",
        icon: "analytics",
      },
    ],
  },
  {
    label: "Network",
    items: [{ label: "Shops", href: "/admin/shops", icon: "shops" }],
  },
  {
    label: "Commerce",
    items: [
      { label: "Orders", href: "/admin/orders", icon: "orders" },
      {
        label: "Logistics",
        href: "/admin/logistics",
        icon: "orders",
      },
      { label: "Refunds", href: "/admin/refunds", icon: "orders" },
      {
        label: "Commissions",
        href: "/admin/commissions",
        icon: "earnings",
      },
      {
        label: "Settlements",
        href: "/admin/settlements",
        icon: "settlements",
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: "products" },
      { label: "Categories", href: "/admin/categories", icon: "categories" },
      { label: "Occasions", href: "/admin/occasions", icon: "occasions" },
      { label: "Tags", href: "/admin/tags", icon: "tags" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Vendor support", href: "/admin/support", icon: "support" },
    ],
  },
];
