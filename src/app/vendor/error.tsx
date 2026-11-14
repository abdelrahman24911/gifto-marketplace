"use client";

import { DashboardError } from "@/components/dashboard/dashboard-error";

export default function VendorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardError
      error={error}
      reset={reset}
      title="The shop dashboard could not load"
      description="Something went wrong while loading this page. Try again, or return to your account if the problem continues."
    />
  );
}
