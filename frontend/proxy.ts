/**
 * Runs on the Next.js server before every page request.
 *
 * 1. Keeps the Supabase login session fresh (refreshes the cookie when needed).
 * 2. Protects private pages:
 *    - not logged in        -> /login
 *    - logged in, not owner -> signed out, sent to /access-denied
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isOwnerEmail } from "@/lib/owner";

// Pages that only the owner may open.
const PRIVATE_PAGES = ["/dashboard"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Called when Supabase refreshes or clears the session: copy the new
        // cookies onto both the request (for this page) and the response (for the browser).
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims() checks the login token's signature, so it can't be faked.
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  const isPrivatePage = PRIVATE_PAGES.some((page) => request.nextUrl.pathname.startsWith(page));
  if (!isPrivatePage) {
    return response;
  }

  if (!email) {
    return redirectTo("/login", request, response);
  }

  if (!isOwnerEmail(email, process.env.OWNER_EMAIL)) {
    await supabase.auth.signOut();
    return redirectTo("/access-denied", request, response);
  }

  return response;
}

/** Redirect, but keep any cookies Supabase just set (e.g. "you are signed out"). */
function redirectTo(path: string, request: NextRequest, response: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // Run on every page, but skip static files and images (they don't need a session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
