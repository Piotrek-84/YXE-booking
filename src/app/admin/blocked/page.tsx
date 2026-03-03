"use client";

import { useEffect, useMemo, useState } from "react";

type BlockedCustomer = {
  id: string;
  fullName?: string | null;
  phone: string;
  email?: string | null;
  clientFacingNote?: string | null;
  reason?: string | null;
  blockedBy?: string | null;
  isActive: boolean;
  isPotentialMaintenance?: boolean;
  createdAt: string;
  updatedAt: string;
  unblockedAt?: string | null;
  unblockedBy?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminBlockedCustomersPage() {
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BlockedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("category", "blocked");
    params.set("scope", scope);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/blocked-customers?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      setError("Couldn’t load blocked clients.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setItems(Array.isArray(data?.blocked) ? data.blocked : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [scope]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.fullName, item.phone, item.email].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term)
      )
    );
  }, [items, search]);

  const unblock = async (id: string) => {
    const response = await fetch(`/api/blocked-customers?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) return;
    await load();
  };

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["active", "history", "all"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase ${
                scope === value
                  ? "bg-slate-100 text-slate-900"
                  : "border border-slate-700 text-slate-300"
              }`}
            >
              {value}
            </button>
          ))}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name / phone / email"
            className="ml-auto rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200"
          >
            Refresh
          </button>
        </div>
      </section>

      {loading && <p className="text-sm text-slate-400">Loading blocked clients…</p>}
      {!loading && error && (
        <p className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          No blocked clients found.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Client note</th>
                <th className="px-4 py-3">Admin reason</th>
                <th className="px-4 py-3">History</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{item.fullName || "Unknown"}</p>
                    <p
                      className={`text-xs ${item.isActive ? "text-rose-300" : "text-emerald-300"}`}
                    >
                      {item.isActive ? "Blocked" : "Unblocked"}
                    </p>
                    {item.isPotentialMaintenance && (
                      <p className="text-xs text-amber-300">Potential maintenance</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p>{item.phone}</p>
                    <p className="text-xs text-slate-400">{item.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.clientFacingNote || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">{item.reason || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <p>Blocked: {formatDateTime(item.createdAt)}</p>
                    <p>By: {item.blockedBy || "admin"}</p>
                    {!item.isActive && (
                      <>
                        <p>Unblocked: {formatDateTime(item.unblockedAt)}</p>
                        <p>By: {item.unblockedBy || "admin"}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <button
                        onClick={() => void unblock(item.id)}
                        className="rounded-lg border border-emerald-700 px-3 py-1 text-xs font-semibold text-emerald-200"
                      >
                        Unblock
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">No actions</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
