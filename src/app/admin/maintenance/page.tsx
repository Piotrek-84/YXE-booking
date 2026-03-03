"use client";

import { useEffect, useMemo, useState } from "react";

type MaintenanceCustomer = {
  id: string;
  fullName?: string | null;
  phone: string;
  email?: string | null;
  blockedBy?: string | null;
  isActive: boolean;
  maintenanceReason?: string | null;
  maintenanceMarkedAt?: string | null;
  maintenanceMarkedBy?: string | null;
  createdAt: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function AdminMaintenanceCustomersPage() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MaintenanceCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("category", "maintenance");
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/blocked-customers?${params.toString()}`, {
      credentials: "include"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload?.error || "Couldn’t load maintenance clients.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setItems(Array.isArray(data?.blocked) ? data.blocked : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.fullName, item.phone, item.email, item.maintenanceReason].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term)
      )
    );
  }, [items, search]);

  const clearMaintenanceMark = async (id: string) => {
    const response = await fetch(
      `/api/blocked-customers?id=${encodeURIComponent(id)}&type=maintenance`,
      {
        method: "DELETE",
        credentials: "include"
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload?.error || "Could not remove maintenance mark.");
      return;
    }
    await load();
  };

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search maintenance clients"
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

      {loading && <p className="text-sm text-slate-400">Loading maintenance clients…</p>}
      {!loading && error && (
        <p className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          No maintenance clients found.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Maintenance note</th>
                <th className="px-4 py-3">Marked</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-semibold">{item.fullName || "Unknown"}</td>
                  <td className="px-4 py-3">
                    <p>{item.phone}</p>
                    <p className="text-xs text-slate-400">{item.email || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{item.maintenanceReason || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    <p>{formatDateTime(item.maintenanceMarkedAt || item.createdAt)}</p>
                    <p>{item.maintenanceMarkedBy || item.blockedBy || "admin"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.isActive
                          ? "bg-rose-900/40 text-rose-200"
                          : "bg-amber-900/40 text-amber-200"
                      }`}
                    >
                      {item.isActive ? "Blocked + Maintenance" : "Potential Maintenance"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void clearMaintenanceMark(item.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200"
                    >
                      Remove mark
                    </button>
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
