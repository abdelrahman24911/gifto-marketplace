import { NextResponse } from "next/server";

import { getSafeAuthPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Exchanges the email-confirmation / magic-link code for a session cookie, then
 * returns the user to a safe, non-reflectable path.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeAuthPath(searchParams.get("next"));
  const siteUrl = getSiteUrl();

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, `${siteUrl}/`));
    }
  }

  const loginUrl = new URL("/login", `${siteUrl}/`);
  loginUrl.searchParams.set("error", "auth");
  return NextResponse.redirect(loginUrl);
}
