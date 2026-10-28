import { redirect } from "next/navigation";

import { requireVendorRole } from "@/lib/vendor";

export default async function VendorIndexPage() {
  const { access } = await requireVendorRole();
  redirect(`/vendor/overview?vendor=${access.vendorId}`);
}
