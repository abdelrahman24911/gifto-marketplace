"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const buttonClass =
  "w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Supabase auth is driven from the browser client here; the Next proxy refreshes
 * the auth cookies and every protected page re-verifies the session server-side.
 * Never rely on this component alone for access control.
 */
export function AuthForm({ mode, initialError }: { mode: Mode; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("full_name") ?? "").trim();

    // The proxy appends ?next=<path> for protected routes; only allow same-site
    // absolute paths so the parameter cannot be used as an open redirect.
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const redirectTo =
      requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/account";

    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.push(redirectTo);
        router.refresh();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        if (data.session) {
          router.push(redirectTo);
          router.refresh();
        } else {
          setMessage("Check your email to confirm your account, then sign in.");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          {mode === "login" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {mode === "login"
            ? "Sign in to track orders and manage your account."
            : "Create an account to track orders and save your details."}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {message}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" ? (
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Full name
            <input
              type="text"
              name="full_name"
              autoComplete="name"
              required
              minLength={2}
              className={inputClass}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Password
          <input
            type="password"
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={6}
            className={inputClass}
          />
        </label>

        <button type="submit" disabled={busy} className={buttonClass}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        {mode === "login" ? (
          <>
            New to Gifto?{" "}
            <Link href="/signup" className="font-medium text-zinc-900 underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-900 underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
