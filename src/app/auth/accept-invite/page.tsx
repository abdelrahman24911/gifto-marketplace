import { AcceptInviteForm } from "./accept-invite-form";

export const metadata = { title: "Accept shop invitation — Gifto" };

export default function AcceptInvitePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <AcceptInviteForm />
      </div>
    </div>
  );
}
