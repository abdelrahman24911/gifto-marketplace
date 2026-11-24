import { maskEmail, maskName, maskPhone } from "./mask-contact";

import type { VendorRole } from "./supabase/database.types";

export function canViewVendorCustomerPii(
  role: VendorRole,
  isPlatformAdmin = false,
): boolean {
  return isPlatformAdmin || role === "owner" || role === "manager";
}

export function vendorContactName(
  name: string | null | undefined,
  canView: boolean,
): string {
  if (!name) return "Customer";
  return canView ? name : maskName(name);
}

export function vendorContactPhone(
  phone: string | null | undefined,
  canView: boolean,
): string | null {
  if (!phone) return null;
  return canView ? phone : maskPhone(phone);
}

export function vendorContactEmail(
  email: string | null | undefined,
  canView: boolean,
): string | null {
  if (!email) return null;
  return canView ? email : maskEmail(email);
}
