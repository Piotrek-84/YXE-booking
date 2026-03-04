"use client";

import { useEffect, useState } from "react";

type RequestContext = {
  employee: {
    id: string;
    fullName: string;
    email: string;
  };
  locationCode?: string | null;
  periodStart: string;
  periodEnd: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ScheduleRequestPage() {
  const [token, setToken] = useState("");

  const [context, setContext] = useState<RequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    requestType: "DAY_OFF",
    requestedDate: "",
    requestedStartTime: "",
    requestedEndTime: "",
    reason: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextToken = new URLSearchParams(window.location.search).get("token") || "";
    setToken(nextToken);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Missing request token.");
      return;
    }

    setLoading(true);
    setError("");
    fetch(`/api/schedule/requests?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Invalid request token.");
        }
        setContext(data);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Unable to load request form.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!token) return;
    setError("");
    setSuccess("");
    const response = await fetch("/api/schedule/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        requestType: form.requestType,
        requestedDate: form.requestedDate || undefined,
        requestedStartTime: form.requestedStartTime || undefined,
        requestedEndTime: form.requestedEndTime || undefined,
        reason: form.reason,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not submit request.");
      return;
    }
    setSuccess("Request sent. Your admin team can now review it.");
    setForm({
      requestType: "DAY_OFF",
      requestedDate: "",
      requestedStartTime: "",
      requestedEndTime: "",
      reason: "",
    });
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <section className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Schedule Request</p>
          <h1 className="text-2xl font-semibold">Day Off / Shift Change</h1>
          {context && (
            <p className="text-sm text-slate-400">
              {context.employee.fullName} · {context.locationCode || "Location not set"} ·{" "}
              {formatDate(context.periodStart)} to {formatDate(context.periodEnd)}
            </p>
          )}
        </header>

        {loading && <p className="text-sm text-slate-400">Loading form…</p>}
        {!loading && error && (
          <p className="rounded-xl border border-rose-800/60 bg-rose-950/20 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        {!loading && success && (
          <p className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3 text-sm text-emerald-200">
            {success}
          </p>
        )}

        {!loading && !error && context && (
          <div className="grid gap-3">
            <select
              value={form.requestType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requestType: event.target.value }))
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="DAY_OFF">Day off request</option>
              <option value="SHIFT_CHANGE">Shift change request</option>
              <option value="OTHER">Other request</option>
            </select>
            <input
              type="date"
              value={form.requestedDate}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requestedDate: event.target.value }))
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="time"
                value={form.requestedStartTime}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, requestedStartTime: event.target.value }))
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <input
                type="time"
                value={form.requestedEndTime}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, requestedEndTime: event.target.value }))
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <textarea
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="Why do you need this change?"
              rows={5}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <button
              onClick={() => void submit()}
              className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100"
            >
              Send request
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
