"use client";

import { useEffect, useState } from "react";
import CustomerLogo from "../../../components/CustomerLogo";
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
  subtotalCents?: number;
  discountCents?: number;
  totalCents: number;
  appliedDiscount?: {
    code?: string;
  } | null;
};

const cityLabel: Record<string, string> = {
  YXE: "Saskatoon",
  YYC: "Calgary",
};

const vehicleSizeLabel: Record<string, string> = {
  car: "Cars",
  suv: "SUV",
  truck: "Trucks",
  large_suv: "Large SUV",
  minivan: "Minivan",
};

export default function ConfirmationPage() {
  const [payload, setPayload] = useState<BookingPayload | null>(null);
  const selectedPackage = payload ? packages.find((item) => item.id === payload.packageId) : null;
  const serviceName = selectedPackage?.name || "";
  const estimatedDurationMins = payload
    ? (payload.estimatedDurationMins ?? selectedPackage?.durationMins ?? 0)
    : 0;

  useEffect(() => {
    const parseDraft = (raw: string | null) => {
      if (!raw) return null;
      try {
        return JSON.parse(raw) as BookingPayload;
      } catch {
        return null;
      }
    };

    const fromSession =
      typeof sessionStorage !== "undefined"
        ? parseDraft(sessionStorage.getItem("bookingDraft"))
        : null;
    const fromLocal =
      typeof localStorage !== "undefined" ? parseDraft(localStorage.getItem("bookingDraft")) : null;
    setPayload(fromSession || fromLocal);
  }, []);

  return (
    <main className="min-h-screen bg-brand-bg px-5 py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-text/70">Confirmation</p>
              <h1 className="text-3xl font-semibold text-brand-text">
                Your appointment is confirmed.
              </h1>
            </div>
            <CustomerLogo className="pointer-events-none mt-1 shrink-0" />
          </div>
        </header>

        {!payload && (
          <div className="rounded-2xl border border-brand-text/25 bg-white p-5 text-sm text-brand-text/80">
            No booking data found. Please complete a booking first.
          </div>
        )}

        {payload && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-brand-text/25 bg-white p-5 text-sm text-brand-text">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">Booking ID</p>
                <p className="text-lg font-semibold text-brand-text">{payload.bookingId}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">Location</p>
                <p className="text-base font-semibold">{cityLabel[payload.city] ?? payload.city}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">
                  Date & Time
                </p>
                <p className="text-base font-semibold">{payload.slotLabel}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">Service</p>
                <p className="text-base font-semibold">{serviceName || "Selected service"}</p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">
                  Vehicle Size
                </p>
                <p className="text-base font-semibold">
                  {payload.vehicleSize ? vehicleSizeLabel[payload.vehicleSize] : "Not provided"}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">Contact</p>
                <p className="text-base font-semibold">{payload.fullName}</p>
                <p>{payload.phone}</p>
                {payload.email && <p>{payload.email}</p>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-brand-text/25 pt-4">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">Subtotal</p>
                <p className="text-base font-semibold text-brand-text">
                  {formatPrice(payload.subtotalCents ?? payload.totalCents)}
                </p>
              </div>
              {(payload.discountCents || 0) > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.15em] text-emerald-700">
                    Discount
                    {payload.appliedDiscount?.code ? ` (${payload.appliedDiscount.code})` : ""}
                  </p>
                  <p className="text-base font-semibold text-emerald-700">
                    -{formatPrice(payload.discountCents || 0)}
                  </p>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">
                  Estimated Total
                </p>
                <p className="text-lg font-semibold text-brand-text">
                  {formatPrice(payload.totalCents)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">
                  Estimated Time
                </p>
                <p className="text-base font-semibold text-brand-text">
                  {formatDuration(estimatedDurationMins)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-text/25 bg-white p-5 text-sm text-brand-text">
              <p className="text-xs uppercase tracking-[0.15em] text-brand-text/70">
                What happens next
              </p>
              <ul className="mt-3 grid gap-2 text-sm text-brand-text/80">
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
