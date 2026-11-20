import { Link } from "@/i18n/navigation";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Forgot password — Gifto" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Forgot your password?
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Enter the email you signed up with. If an account uses it, we will
        send a link to choose a new password.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-sm text-zinc-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
