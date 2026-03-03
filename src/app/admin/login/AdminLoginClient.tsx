"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginClient() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    setLoading(false);

    if (!response.ok) {
      if (response.status === 429) {
        setError("Too many attempts. Please wait about 1 minute and try again.");
      } else {
        setError("Invalid password.");
      }
      return;
    }

    const next = searchParams.get("next") || "/admin/bookings";
    router.push(next);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <section className="mx-auto flex max-w-md flex-col gap-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
          <h1 className="text-3xl font-semibold">Sign in</h1>
          <p className="text-slate-400">Use your admin credentials.</p>
        </header>
        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              required
            />
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
