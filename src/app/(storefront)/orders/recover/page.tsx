import Link from "next/link";

import { RecoverOrderForm } from "./recover-form";

export const metadata = {
  title: "Recover your order — Gifto",
  robots: { index: false, follow: false },
};

export default async function RecoverOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Recover your order
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Lost the browser or device your order link was on? Enter the order
        reference from your confirmation and the phone number or email you
        used at checkout, and we will email you a fresh one-time link. The
        link works for one hour and can be used once.
      </p>

      {error === "invalid" ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          That recovery link is invalid or has expired. Request a new one
          below.
        </p>
      ) : null}

      <RecoverOrderForm />

      <p className="mt-6 text-sm text-zinc-600">
        <Link href="/shops" className="font-medium text-zinc-900 underline">
          Continue shopping
        </Link>
      </p>
    </div>
  );
}
