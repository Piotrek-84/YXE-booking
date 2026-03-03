"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ManageBooking = {
  id: string;
  status: string;
  startAt?: string | null;
  requestedDate: string;
  requestedWindow: string;
  tokenExpiresAt?: string | null;
  customer: { fullName: string; phone: string; email?: string | null };
  service: { id: string; name: string };
  vehicle: { year?: number | null; make: string; model: string; size?: string | null };
  location: { code: string; name: string };
  addOns: { name: string; priceCents: number }[];
};

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric"
  })} ${date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

export default function ManageBookingPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<ManageBooking | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newStartAt, setNewStartAt] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<{ start: string; label: string; isAvailable: boolean }[]>([]);
  const [message, setMessage] = useState("");

  const token = params?.token;

  useEffect(() => {
    if (!token) return;
    let active = true;

    setLoading(true);
    fetch(`/api/manage/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "This manage link is not valid.");
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setBooking(data.booking ?? null);
        const initialDate = String(data.booking?.startAt || data.booking?.requestedDate || "").slice(0, 10);
        setSelectedDate(initialDate);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load booking.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!booking?.service?.id || !booking?.location?.code) return;
    fetch(`/api/availability?location=${booking.location.code}&serviceId=${booking.service.id}`)
      .then((res) => res.json())
      .then((data) => {
        const nextSlots = Array.isArray(data?.slots) ? data.slots : [];
        setSlots(nextSlots);
      })
      .catch(() => {
        setSlots([]);
      });
  }, [booking?.service?.id, booking?.location?.code]);

  const canManage = useMemo(() => {
    if (!booking?.startAt) return false;
    return booking.status !== "CANCELED";
  }, [booking]);

  const runAction = async (action: "cancel" | "reschedule") => {
    if (!token) return;
    setSaving(true);
    setError("");
    setMessage("");

    const body: Record<string, string> = { action };
    if (action === "reschedule") body.newStartAt = newStartAt;

    const response = await fetch(`/api/manage/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data?.error || "Could not update booking.");
      setSaving(false);
      return;
    }

    setMessage(data?.message || "Booking updated.");
    setSaving(false);

    if (action === "cancel") {
      setBooking((prev) => (prev ? { ...prev, status: "CANCELED" } : prev));
    }

    if (action === "reschedule" && data?.booking?.startAt && data?.booking?.requestedWindow) {
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              startAt: data.booking.startAt,
              requestedWindow: data.booking.requestedWindow,
              status: data.booking.status || prev.status
            }
          : prev
      );
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Loading booking...
        </div>
      </main>
    );
  }

  if (error || !booking) {
    return (
      <main className="min-h-screen bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {error || "Invalid or expired manage link."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Manage Booking</p>
          <h1 className="text-3xl font-semibold text-slate-900">{booking.service.name}</h1>
          <p className="text-slate-600">{booking.location.name}</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Current appointment</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatDateTime(booking.startAt || booking.requestedDate)}
          </p>
          <p className="mt-1 text-sm text-slate-600">Status: {booking.status.replaceAll("_", " ")}</p>
          <p className="mt-2 text-sm text-slate-600">
            Vehicle: {booking.vehicle.year ?? ""} {booking.vehicle.make} {booking.vehicle.model}
          </p>
        </section>

        {message && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {canManage && (
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
              Select date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setNewStartAt("");
                }}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {slots
                .filter((slot) => String(slot.start).slice(0, 10) === selectedDate)
                .map((slot) => (
                  <button
                    key={slot.start}
                    onClick={() => setNewStartAt(slot.start)}
                    disabled={!slot.isAvailable}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      newStartAt === slot.start
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-800"
                    } ${!slot.isAvailable ? "opacity-50" : ""}`}
                  >
                    {slot.label}
                  </button>
                ))}
              {slots.filter((slot) => String(slot.start).slice(0, 10) === selectedDate).length === 0 && (
                <p className="text-sm text-slate-500">No available slots for this date.</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void runAction("reschedule")}
                disabled={saving || !newStartAt}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Reschedule"}
              </button>
              <button
                onClick={() => void runAction("cancel")}
                disabled={saving}
                className="rounded-2xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Cancel booking"}
              </button>
            </div>
          </section>
        )}

        {!canManage && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            This booking can no longer be updated online. Please contact us directly.
          </section>
        )}
      </div>
    </main>
  );
}
