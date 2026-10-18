import { requireUser } from "@/lib/auth";

import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Checkout — Gifto" };

export default async function CheckoutPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Checkout
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Cash on delivery. Orders that span several shops are split into separate
        deliveries, each handled by its own shop.
      </p>

      <CheckoutForm
        defaults={{
          recipientName: profile?.full_name ?? "",
          contactPhone: profile?.phone ?? "",
          addressLine: "",
          city: "",
          governorate: "",
          notes: "",
        }}
      />
    </div>
  );
}
