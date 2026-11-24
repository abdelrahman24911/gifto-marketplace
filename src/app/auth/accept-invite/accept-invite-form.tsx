"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getSafeAuthPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast-provider";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

type Status = "loading" | "ready" | "invalid";

export function AcceptInviteForm() {
  const router = useRouter();
  const { flash } = useToast();
  const nextPathRef = useRef("/account");
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    nextPathRef.current = getSafeAuthPath(query.get("next"));
    const code = query.get("code");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) {
        setStatus("ready");
      }
    });

    void (async () => {
      if (
        query.get("error") ||
        query.get("error_description") ||
        hash.get("error") ||
        hash.get("error_description")
      ) {
        if (active) setStatus("invalid");
        return;
      }

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;

        if (exchangeError) {
          setStatus("invalid");
          return;
        }

        window.history.replaceState(null, "", window.location.pathname);
        setStatus("ready");
        return;
      }

      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!active) return;

        if (setSessionError) {
          setStatus("invalid");
          return;
        }

        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        setStatus("ready");
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      setStatus(!sessionError && data.session ? "ready" : "invalid");
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      flash("Your password is set - welcome to Gifto.", "success");
      router.replace(nextPathRef.current);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          Opening your invitation
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Verifying your secure invitation link…
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          Invitation unavailable
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          This invitation link is invalid or has expired. Ask the person who
          invited you to send a new invitation.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link href="/" className="font-medium text-zinc-900 underline">
            Go to Gifto
          </Link>
          <Link href="/login" className="font-medium text-zinc-900 underline">
            Already accepted? Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-900">
        Set your shop password
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Choose a password for your new Gifto shop account. You can sign in with
        your email and this password afterwards.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Confirm password
          <input
            type="password"
            name="confirm_password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save password and continue"}
        </button>
      </form>
    </div>
  );
}
