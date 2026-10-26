"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Calls the backend's protected GET /api/me with our login token.
 * If this shows "Connected", the whole login chain works end to end:
 * Google -> Supabase -> browser -> FastAPI owner check.
 */
export function BackendCheck() {
  const [message, setMessage] = useState("Checking backend...");

  useEffect(() => {
    async function check() {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setMessage("Not logged in.");
        return;
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const body = await response.json();
          setMessage(`Connected. Backend confirmed you are ${body.email}.`);
        } else {
          setMessage(`Backend refused the request (HTTP ${response.status}).`);
        }
      } catch {
        setMessage("Could not reach the backend. Is it running?");
      }
    }

    check();
  }, []);

  return <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>;
}
