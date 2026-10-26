import Link from "next/link";

/** Shown when someone other than the owner tries to log in. They are already signed out. */
export default function AccessDeniedPage() {
  return (
    <section className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-red-600 dark:text-red-400">Access denied</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This is a private, single-owner app. Your Google account is not allowed and you have been
        signed out.
      </p>
      <Link href="/" className="underline">
        Back to home
      </Link>
    </section>
  );
}
