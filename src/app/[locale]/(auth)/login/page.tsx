import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError =
    error === "auth"
      ? "That sign-in link is invalid or has expired. Please sign in again."
      : undefined;

  return <AuthForm mode="login" initialError={initialError} />;
}
