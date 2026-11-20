import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Choose a new password — Gifto" };

/**
 * Reached from a password-reset link after /auth/callback exchanges the
 * code for a recovery session. Without that session the form's update is
 * rejected and the customer is asked to request a new link.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Choose a new password
      </h1>
      {user ? (
        <>
          <p className="mt-2 text-sm text-zinc-600">
            Signed in as {user.email}. Choose a new password for your Gifto
            account.
          </p>
          <ResetPasswordForm />
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          That reset link is invalid or has expired. Request a new one from
          the sign-in page.
        </p>
      )}
    </div>
  );
}
