import { redirect } from "next/navigation";

/**
 * The vendor area entry point. Which shop is shown is resolved from the
 * caller's memberships on the products page.
 */
export default async function VendorIndexPage() {
  redirect("/vendor/products");
}
