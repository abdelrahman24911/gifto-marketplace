import { getRequestContext } from "@/lib/auth";

import { CheckoutForm, type CheckoutDefaults } from "./checkout-form";

export const metadata = { title: "Checkout — Gifto" };

export default async function CheckoutPage() {
  // Shares the header's request-scoped session lookup instead of opening a
  // second one. This only pre-fills the form; the Server Action re-verifies the
  // session with the Auth server before placing an order.
  const { supabase, user } = await getRequestContext();

  const defaults: CheckoutDefaults = {
    recipientName: "",
    contactPhone: "",
    contactEmail: "",
    addressLine: "",
    city: "",
    governorate: "",
    notes: "",
  };

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();

    defaults.recipientName = profile?.full_name ?? "";
    defaults.contactPhone = profile?.phone ?? "";
    defaults.contactEmail = user.email ?? "";
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Checkout
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Cash on delivery. No account needed — orders that span several shops are
        split into separate deliveries, each handled by its own shop.
      </p>

      <CheckoutForm defaults={defaults} />
    </div>
  );
}
