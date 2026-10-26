/**
 * Google sends the user back here after login (via Supabase) with a one-time `code`.
 * We swap the code for a login session, then check that it's the owner.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isOwnerEmail } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // No code means login failed or was blocked (e.g. by the sign-up hook for a stranger).
  if (!code) {
    return NextResponse.redirect(`${origin}/access-denied`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=login_failed`);
  }

  if (!isOwnerEmail(data.user.email, process.env.OWNER_EMAIL)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/access-denied`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
