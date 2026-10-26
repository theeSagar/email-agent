"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const loginFailed = useSearchParams().get("error") !== null;

  async function loginWithGoogle() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      // After Google, come back to our callback route, which checks the owner.
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <section className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Owner login</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only the owner&apos;s Google account can sign in.
      </p>
      {loginFailed && (
        <p className="text-sm text-red-600 dark:text-red-400">Login failed. Please try again.</p>
      )}
      <button
        type="button"
        onClick={loginWithGoogle}
        className="w-full rounded-md bg-zinc-900 px-5 py-2.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Continue with Google
      </button>
    </section>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
