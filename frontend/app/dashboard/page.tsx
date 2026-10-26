import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackendCheck } from "@/components/backend-check";
import { LogoutButton } from "@/components/logout-button";
import { isOwnerEmail } from "@/lib/owner";
import { createClient } from "@/lib/supabase/server";

/** Private home page. */
export default function DashboardPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </div>
      {/* Reading the login cookie happens per request, so that part loads inside Suspense. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading...</p>}>
        <OwnerInfo />
      </Suspense>
      <p className="text-sm text-zinc-500">
        Job digest, reply inbox and tracker arrive in the next phases.
      </p>
    </section>
  );
}

/** proxy.ts already guards this page; we check again here, close to the data. */
async function OwnerInfo() {
  // Wait for a real visitor's request: the login check below looks at the
  // current time (token expiry), so it must never be pre-built ahead of time.
  await connection();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  if (!isOwnerEmail(email, process.env.OWNER_EMAIL)) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-2">
      <p>
        Logged in as <strong>{email}</strong>.
      </p>
      <BackendCheck />
    </div>
  );
}
