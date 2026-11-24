import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";

import { AcceptInvitationForm } from "./accept-invitation-form";

export const metadata = { title: "Shop invitations - Gifto" };

const ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
} as const;

export default async function AccountInvitationsPage() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("list_my_vendor_invitations");
  const invitations = data ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Shop invitations
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Signed in as {user.email}. Only invitations for this email address
        appear here, and shop access starts only after you accept.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Your invitations couldn&apos;t load.{" "}
          <Link
            href="/account/invitations"
            className="font-medium underline"
          >
            Try again
          </Link>
          .
        </p>
      ) : invitations.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
          No pending shop invitations for this email address. Ask the shop
          owner to send a new invitation if you were expecting one.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900">
                    {invitation.vendor_name}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Invited as {ROLE_LABELS[invitation.role]}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Expires{" "}
                    {new Date(invitation.expires_at).toLocaleDateString(
                      "en-GB",
                    )}
                  </p>
                </div>
                <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700">
                  Pending
                </span>
              </div>
              <AcceptInvitationForm invitationId={invitation.id} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Link
          href="/account"
          className="text-sm font-medium text-zinc-900 underline"
        >
          Back to your account
        </Link>
      </div>
    </main>
  );
}
