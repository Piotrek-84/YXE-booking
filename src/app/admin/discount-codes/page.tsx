"use client";

import { useEffect, useMemo, useState } from "react";

type DiscountCode = {
  id: string;
  code: string;
  description?: string | null;
  discountType: "PERCENTAGE" | "FIXED_CENTS";
  percentOff?: number | null;
  fixedAmountCents?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  redemptionCount: number;
  isActive: boolean;
  createdAt: string;
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

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export default function AdminDiscountCodesPage() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"active" | "all">("all");
  const [items, setItems] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_CENTS">("PERCENTAGE");
  const [percentOff, setPercentOff] = useState("10");
  const [fixedAmount, setFixedAmount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/discount-codes?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data?.error || "Couldn’t load discount codes.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    setItems(Array.isArray(data?.codes) ? data.codes : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [scope]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.code, item.description].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term)
      )
    );
  }, [items, search]);

  const createCode = async () => {
    setSubmitError("");
    setSubmitting(true);

    const payload = {
      code,
      description,
      discountType,
      percentOff: discountType === "PERCENTAGE" ? Number(percentOff) : undefined,
      fixedAmountCents:
        discountType === "FIXED_CENTS" ? Math.round(Number(fixedAmount || "0") * 100) : undefined,
      startsAt: toIsoOrUndefined(startsAt) || "",
      endsAt: toIsoOrUndefined(endsAt) || "",
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      isActive: true,
    };

    const response = await fetch("/api/discount-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setSubmitError(data?.error || "Could not create discount code.");
      setSubmitting(false);
      return;
    }

    setCode("");
    setDescription("");
    setPercentOff("10");
    setFixedAmount("");
    setStartsAt("");
    setEndsAt("");
    setMaxRedemptions("");
    setSubmitting(false);
    await load();
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const response = await fetch("/api/discount-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, isActive }),
    });
    if (!response.ok) return;
    await load();
  };

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Create Discount Code</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code (e.g. SUV10)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <select
            value={discountType}
            onChange={(event) =>
              setDiscountType(event.target.value as "PERCENTAGE" | "FIXED_CENTS")
            }
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED_CENTS">Fixed amount ($)</option>
          </select>
          {discountType === "PERCENTAGE" ? (
            <input
              type="number"
              min={1}
              max={100}
              value={percentOff}
              onChange={(event) => setPercentOff(event.target.value)}
              placeholder="Percent off"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          ) : (
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={fixedAmount}
              onChange={(event) => setFixedAmount(event.target.value)}
              placeholder="Amount off in dollars"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          )}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <input
            type="number"
            min={1}
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
            placeholder="Max redemptions (optional)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        {submitError && <p className="mt-3 text-sm text-rose-300">{submitError}</p>}
        <div className="mt-3">
          <button
            onClick={() => void createCode()}
            disabled={submitting}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create code"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active"] as const).map((value) => (
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
            placeholder="Search codes"
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

      {loading && <p className="text-sm text-slate-400">Loading discount codes…</p>}
      {!loading && error && (
        <p className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          No discount codes found.
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-[0.15em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{item.code}</p>
                    <p className="text-xs text-slate-400">{item.description || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {item.discountType === "PERCENTAGE"
                      ? `${item.percentOff || 0}%`
                      : `$${((item.fixedAmountCents || 0) / 100).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    <p>Start: {formatDateTime(item.startsAt)}</p>
                    <p>End: {formatDateTime(item.endsAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {item.redemptionCount}
                    {item.maxRedemptions ? ` / ${item.maxRedemptions}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs ${item.isActive ? "text-emerald-300" : "text-slate-500"}`}
                    >
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void toggleActive(item.id, !item.isActive)}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200"
                    >
                      {item.isActive ? "Deactivate" : "Activate"}
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
