"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  login: string;
  fullName?: string | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminUsersPage() {
  const [masterLogin, setMasterLogin] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    login: "",
    password: "",
    fullName: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/admin-users", { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not load admin users.");
      setLoading(false);
      return;
    }
    setMasterLogin(data?.masterLogin || "");
    setUsers(Array.isArray(data?.users) ? data.users : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const addAdminUser = async () => {
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not create admin user.");
      return;
    }
    setForm({ login: "", password: "", fullName: "" });
    setMessage("Admin user created.");
    await load();
  };

  const toggleUser = async (id: string, isActive: boolean) => {
    setError("");
    const response = await fetch("/api/admin/admin-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, isActive }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not update admin user.");
      return;
    }
    await load();
  };

  const resetPassword = async (id: string) => {
    const password = window.prompt("Enter a new password (minimum 8 characters):") || "";
    if (!password.trim()) return;
    setError("");
    const response = await fetch("/api/admin/admin-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not reset password.");
      return;
    }
    setMessage("Password updated.");
  };

  const removeUser = async (id: string) => {
    if (!window.confirm("Remove this admin user?")) return;
    setError("");
    const response = await fetch(`/api/admin/admin-users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not remove admin user.");
      return;
    }
    await load();
  };

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Master Admin</p>
        <p className="mt-1 text-sm text-slate-200">{masterLogin || "not configured"}</p>
        <p className="mt-1 text-xs text-slate-400">
          This account controls admin access and can create other admin logins.
        </p>
      </section>

      {(error || message) && (
        <section
          className={`rounded-xl border p-3 text-sm ${
            error
              ? "border-rose-800/60 bg-rose-950/20 text-rose-200"
              : "border-emerald-800/60 bg-emerald-950/20 text-emerald-200"
          }`}
        >
          {error || message}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-slate-100">Grant Admin Access</p>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={form.login}
            onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
            placeholder="Login"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <input
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="Name (optional)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <button
          onClick={() => void addAdminUser()}
          className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100"
        >
          Add admin
        </button>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-100">Admin Users</p>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && users.length === 0 && (
          <p className="text-sm text-slate-400">No additional admin users yet.</p>
        )}
        {!loading && users.length > 0 && (
          <div className="grid gap-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 md:grid-cols-[1fr_auto_auto_auto]"
              >
                <div>
                  <p className="font-semibold text-slate-100">{user.fullName || user.login}</p>
                  <p className="text-xs text-slate-400">@{user.login}</p>
                  <p className="text-xs text-slate-500">
                    Added {formatDateTime(user.createdAt)} by {user.createdBy || "master"}
                  </p>
                </div>
                <button
                  onClick={() => void toggleUser(user.id, !user.isActive)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    user.isActive
                      ? "border-amber-700 text-amber-200"
                      : "border-emerald-700 text-emerald-200"
                  }`}
                >
                  {user.isActive ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => void resetPassword(user.id)}
                  className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-200"
                >
                  Reset password
                </button>
                <button
                  onClick={() => void removeUser(user.id)}
                  className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-200"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
