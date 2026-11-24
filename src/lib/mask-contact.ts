// Masking for customer contact details in list views (admin orders, vendor
// orders/refunds/overview). A list is a triage surface: staff can tell orders
// apart without the full name, phone or email. Full contact stays on detail
// pages for owners/managers (and admins), where it is needed to operate.
// Masking is display-only — the search still matches the full values.

/** "Abdelrahman Osama" -> "Abdelrahman O."; a single name -> "Mona…" */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) {
    const first = parts[0];
    return first.length > 1 ? `${first[0]}…` : first;
  }
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0]}.`;
}

/** Keeps only the last two digits: "01012345678" -> "•••••••78". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "—";
  if (digits.length <= 2) return "••";
  return `${"•".repeat(digits.length - 2)}${digits.slice(-2)}`;
}

/** Keeps the first letter and the domain: "a@b.com" -> "a•••@b.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const domain = email.slice(at + 1);
  if (!domain) return "•••";
  return `${email[0]}•••@${domain}`;
}
