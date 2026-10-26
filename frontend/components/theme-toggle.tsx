"use client";

import { useTheme } from "next-themes";

/** Switches between light and dark mode. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      aria-label="Toggle dark mode"
    >
      {/* suppressHydrationWarning: the theme is only known once the page is in the browser. */}
      <span suppressHydrationWarning>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
