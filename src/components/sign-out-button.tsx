"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton({
  className,
  onDone,
  label = "Sign out",
  busyLabel = "Signing out…",
}: {
  className?: string;
  onDone?: () => void;
  /** Storefront callers pass translated labels; admin keeps the default. */
  label?: string;
  busyLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      onDone?.();
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={className}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
