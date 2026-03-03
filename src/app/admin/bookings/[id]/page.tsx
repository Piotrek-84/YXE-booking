"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const statusOptions = [
  "REQUESTED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW"
] as const;

type BookingDetail = {
  id: string;
  status: string;
  requestedDate: string;
  requestedWindow: string;
  customerNotes?: string | null;
  adminNotes?: string | null;
  customer: { fullName: string; phone: string; email?: string | null };
  vehicle: {
    size?: string | null;
    year?: number | null;
    make: string;
    model: string;
    trim?: string | null;
    color?: string | null;
    plate?: string | null;
  };
  service: { name: string; description: string };
  addOns: { addOn: { name: string; priceCents: number } }[];
  location: { code: string; name: string };
};

function formatDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    if (!params?.id) return;
    fetch(`/api/bookings/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setBooking(data.booking ?? null);
        setStatus(data.booking?.status ?? "");
        setNotes(data.booking?.adminNotes ?? "");
      });

    return () => {
      active = false;
    };
  }, [params?.id]);

  const saveUpdates = async () => {
    setSaving(true);
    setSaveError("");
    if (!params?.id) return;
    const response = await fetch(`/api/bookings/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes: notes })
    });
    if (!response.ok) {
      setSaveError("Could not save changes. Try again.");
    } else {
      setLastSaved(new Date());
    }
    setSaving(false);
  };

  const isDirty =
    booking &&
    (status !== booking.status || notes !== (booking.adminNotes ?? ""));

  if (!booking) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
        Loading booking...
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Booking</p>
        <h2 className="text-2xl font-semibold">{booking.customer.fullName}</h2>
        <p className="text-slate-400">
          {formatDate(booking.requestedDate)} · {booking.requestedWindow} · {booking.location.code}
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="grid gap-3">
          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Internal Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              placeholder="Team-only notes"
            />
          </label>
          {saveError && <p className="text-sm text-rose-400">{saveError}</p>}
          {lastSaved && (
            <p className="text-xs text-slate-500">
              Saved {lastSaved.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <button
            onClick={saveUpdates}
            disabled={!isDirty || saving}
            className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900"
          >
            {saving ? "Saving..." : "Save updates"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Service</p>
          <p className="mt-1 text-lg font-semibold">{booking.service.name}</p>
          <p className="text-sm text-slate-400">{booking.service.description}</p>
          {booking.addOns.length > 0 && (
            <div className="mt-3 text-sm text-slate-300">
              Add-ons: {booking.addOns.map((item) => item.addOn.name).join(", ")}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Customer</p>
          <p className="mt-1 text-lg font-semibold">{booking.customer.fullName}</p>
          <p className="text-sm text-slate-400">{booking.customer.phone}</p>
          {booking.customer.email && (
            <p className="text-sm text-slate-400">{booking.customer.email}</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Vehicle</p>
          <p className="mt-1 text-lg font-semibold">
            {booking.vehicle.year ?? ""} {booking.vehicle.make} {booking.vehicle.model}
          </p>
          {booking.vehicle.size && (
            <p className="text-sm text-slate-400">
              Size: {booking.vehicle.size.replaceAll("_", " ")}
            </p>
          )}
          {booking.vehicle.trim && <p className="text-sm text-slate-400">Trim: {booking.vehicle.trim}</p>}
          {booking.vehicle.color && <p className="text-sm text-slate-400">Color: {booking.vehicle.color}</p>}
          {booking.vehicle.plate && <p className="text-sm text-slate-400">Plate: {booking.vehicle.plate}</p>}
        </div>
        {booking.customerNotes && (
          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Customer Notes</p>
            <p className="mt-1 text-sm text-slate-300">{booking.customerNotes}</p>
          </div>
        )}
      </section>
    </section>
  );
}
