export type DashboardIconName =
  | "overview"
  | "orders"
  | "shops"
  | "products"
  | "categories"
  | "occasions"
  | "tags"
  | "settlements"
  | "support"
  | "analytics"
  | "settings"
  | "inventory"
  | "earnings"
  | "help";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: DashboardIconName;
  exact?: boolean;
};

export type DashboardNavGroup = {
  label: string;
  items: DashboardNavItem[];
};

export type DashboardShop = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type DashboardUser = {
  email?: string;
  roleLabel: string;
};
