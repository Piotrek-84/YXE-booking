"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatPrice, packages } from "../../../lib/booking-data";

type BookingPayload = {
  bookingId: string;
  city: string;
  packageId: string;
  estimatedDurationMins?: number;
  vehicleSize?: "car" | "suv" | "truck" | "large_suv" | "minivan" | "";
  slotLabel: string;
  fullName: string;
  phone: string;
  email: string;
  totalCents: number;
};

const cityLabel: Record<string, string> = {
  YXE: "Saskatoon",
  YYC: "Calgary"
};

const vehicleSizeLabel: Record<string, string> = {
  car: "Cars",
  suv: "SUV",
  truck: "Trucks",
  large_suv: "Large SUV",
  minivan: "Minivan"
};

export default function ConfirmationPage() {
  const [payload, setPayload] = useState<BookingPayload | null>(null);
  const selectedPackage = payload ? packages.find((item) => item.id === payload.packageId) : null;
  const serviceName = selectedPackage?.name || "";
  const estimatedDurationMins = payload
    ? (payload.estimatedDurationMins ??
      (selectedPackage?.durationMins ?? 0))
    : 0;

  useEffect(() => {
    const raw = sessionStorage.getItem("bookingDraft");
    if (!raw) return;
    setPayload(JSON.parse(raw));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Confirmation</p>
          <h1 className="text-3xl font-semibold text-slate-900">Your appointment is confirmed.</h1>
          <p className="text-slate-600">
            We may text you if we need access details.
          </p>
        </header>

        {!payload && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No booking data found. Please complete a booking first.
          </div>
        )}

        {payload && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Booking ID</p>
                <p className="text-lg font-semibold text-slate-900">{payload.bookingId}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Location</p>
                <p className="text-base font-semibold">{cityLabel[payload.city] ?? payload.city}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Date & Time</p>
                <p className="text-base font-semibold">
                  {payload.slotLabel}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Service</p>
                <p className="text-base font-semibold">{serviceName || "Selected service"}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Vehicle Size</p>
                <p className="text-base font-semibold">
                  {payload.vehicleSize ? vehicleSizeLabel[payload.vehicleSize] : "Not provided"}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Contact</p>
                <p className="text-base font-semibold">{payload.fullName}</p>
                <p>{payload.phone}</p>
                {payload.email && <p>{payload.email}</p>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Estimated Total</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatPrice(payload.totalCents)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Estimated Time</p>
                <p className="text-base font-semibold text-slate-900">
                  {formatDuration(estimatedDurationMins)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">What happens next</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-600">
                <li>Remove personal items</li>
                <li>Let us know special concerns</li>
                <li>Disconnect child seats & boosters</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
