import Link from "next/link";

/** Public landing page. */
export default function LandingPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Inbox2Offer</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Turns a job-search inbox into a ranked daily job digest and AI-drafted recruiter replies,
        with a human approving every action.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Owner login
        </Link>
        {/* The public demo is built in Phase 6. */}
        <span
          title="Coming soon"
          className="cursor-not-allowed rounded-md border border-zinc-300 px-5 py-2.5 text-zinc-400 dark:border-zinc-700"
        >
          Try the demo (coming soon)
        </span>
      </div>
    </section>
  );
}
