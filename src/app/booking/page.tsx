"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import VehicleSizeCard from "../../components/VehicleSizeCard";
import {
  addOns,
  type CityCode,
  formatDuration,
  formatPrice,
  packages,
} from "../../lib/booking-data";
import { normalizePhone } from "../../lib/phone";

const steps = ["Vehicle Size", "Category", "Add-ons", "Date & Time", "Customer & Review"];

const categoryOptions = [
  { id: "INT_EXT", label: "Interior & Exterior" },
  { id: "INT_ONLY", label: "Interior Only" },
  { id: "EXT_ONLY", label: "Exterior Only" },
] as const;

const vehicleSizeOptions = [
  {
    id: "car",
    title: "Cars",
    subtitle: "2 & 4 Door Cars",
    imageSrc: "/assets/vehicle-size/car@2x.png",
  },
  {
    id: "suv",
    title: "SUV",
    subtitle: "5 seats / crossover",
    imageSrc: "/assets/vehicle-size/suv@2x.png",
  },
  {
    id: "truck",
    title: "Trucks",
    subtitle: "2 & 4 Door Trucks",
    imageSrc: "/assets/vehicle-size/truck@2x.png",
  },
  {
    id: "large_suv",
    title: "Large SUV",
    subtitle: "6+ seats",
    imageSrc: "/assets/vehicle-size/large-suv@2x.png",
  },
  {
    id: "minivan",
    title: "Minivan",
    subtitle: "",
    imageSrc: "/assets/vehicle-size/minivan@2x.png",
  },
] as const;

const vehicleSizeLabel: Record<BookingForm["vehicleSize"], string> = {
  "": "",
  car: "Cars",
  suv: "SUV",
  truck: "Trucks",
  large_suv: "Large SUV",
  minivan: "Minivan",
};

const cityLabel: Record<CityCode, string> = {
  YXE: "Saskatoon",
  YYC: "Calgary",
};

type BookingForm = {
  city: CityCode;
  vehicleSize: "" | "car" | "suv" | "truck" | "large_suv" | "minivan";
  category: "" | "INT_EXT" | "INT_ONLY" | "EXT_ONLY";
  packageId: string;
  addOnIds: string[];
  bookingStart: string;
  slotLabel: string;
  fullName: string;
  phone: string;
  email: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleTrim: string;
  vehicleColor: string;
  giftCardNumber: string;
  notes: string;
  submitError: string;
};

type FieldErrors = Partial<
  Record<
    | "fullName"
    | "phone"
    | "email"
    | "vehicleYear"
    | "vehicleMake"
    | "vehicleModel"
    | "vehicleTrim"
    | "vehicleColor"
    | "giftCardNumber"
    | "notes",
    string
  >
>;

type GiftCardCheckState = {
  status: "idle" | "checking" | "valid" | "invalid" | "error";
  message?: string;
  normalizedGan?: string;
  cardId?: string;
  last4?: string;
  balanceAmount?: number | null;
  currency?: string | null;
};

const CLIENT_DEVICE_STORAGE_KEY = "yxe_booking_device_id";
const CLIENT_DEVICE_COOKIE = "yxe_booking_device_id";

const initialForm: BookingForm = {
  city: "YXE",
  vehicleSize: "",
  category: "",
  packageId: "",
  addOnIds: [],
  bookingStart: "",
  slotLabel: "",
  fullName: "",
  phone: "",
  email: "",
  vehicleYear: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleTrim: "",
  vehicleColor: "",
  giftCardNumber: "",
  notes: "",
  submitError: "",
};

const initialFieldErrors: FieldErrors = {};

function toUpperFirstLetter(value: string) {
  if (value.length === 0) return "";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function normalizeFullName(value: string) {
  return value
    .trim()
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      return part
        .split("-")
        .map((segment) =>
          segment.length === 0
            ? ""
            : toUpperFirstLetter(segment.charAt(0).toLowerCase() + segment.slice(1).toLowerCase())
        )
        .join("-");
    })
    .join("");
}

function normalizeEmail(value: string) {
  return toUpperFirstLetter(value.trim());
}

function validateCustomerFields(form: BookingForm) {
  const errors: FieldErrors = {};
  const normalizedPhone = normalizePhone(form.phone);
  const trimmedEmail = form.email.trim();
  const year = form.vehicleYear.trim();
  const now = new Date();
  const maxYear = now.getFullYear() + 1;

  if (form.fullName.trim().length < 2) {
    errors.fullName = "Full name is required.";
  } else if (form.fullName.trim().length > 80) {
    errors.fullName = "Full name must be 80 characters or less.";
  }

  if (normalizedPhone.length < 7) {
    errors.phone = "Enter a valid phone number (numbers only, no spaces).";
  }

  if (trimmedEmail.length === 0) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (year.length > 0) {
    const yearNumber = Number(year);
    if (!/^\d{4}$/.test(year)) {
      errors.vehicleYear = "Year must be 4 digits.";
    } else if (!Number.isInteger(yearNumber) || yearNumber < 1980 || yearNumber > maxYear) {
      errors.vehicleYear = `Year must be between 1980 and ${maxYear}.`;
    }
  }

  if (form.vehicleMake.trim().length < 2) {
    errors.vehicleMake = "Vehicle make is required.";
  } else if (form.vehicleMake.trim().length > 40) {
    errors.vehicleMake = "Vehicle make must be 40 characters or less.";
  }

  if (form.vehicleModel.trim().length < 1) {
    errors.vehicleModel = "Vehicle model is required.";
  } else if (form.vehicleModel.trim().length > 40) {
    errors.vehicleModel = "Vehicle model must be 40 characters or less.";
  }

  if (form.vehicleTrim.trim().length > 40) {
    errors.vehicleTrim = "Trim must be 40 characters or less.";
  }

  if (form.vehicleColor.trim().length > 30) {
    errors.vehicleColor = "Color must be 30 characters or less.";
  }

  if (form.giftCardNumber.trim().length > 0) {
    const normalizedGiftCard = normalizeGiftCardNumber(form.giftCardNumber);
    if (normalizedGiftCard.length < 8) {
      errors.giftCardNumber = "Enter a valid gift card number.";
    }
  }

  if (form.notes.trim().length > 500) {
    errors.notes = "Notes must be 500 characters or less.";
  }

  return errors;
}

function normalizeGiftCardNumber(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normalizeClientDeviceId(value: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized)) return "";
  return normalized;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const raw = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return raw ? decodeURIComponent(raw.slice(prefix.length)) : "";
}

function persistClientDeviceId(deviceId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLIENT_DEVICE_STORAGE_KEY, deviceId);
  } catch {}
  // biome-ignore lint/suspicious/noDocumentCookie: persistent first-party device token is required for blocklist checks.
  document.cookie = `${CLIENT_DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; Max-Age=63072000; Path=/; SameSite=Lax`;
}

function getOrCreateClientDeviceId() {
  if (typeof window === "undefined") return "";

  const fromStorage = (() => {
    try {
      return window.localStorage.getItem(CLIENT_DEVICE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  })();
  const fromCookie = readCookie(CLIENT_DEVICE_COOKIE);
  const existing = normalizeClientDeviceId(fromStorage || fromCookie);
  if (existing) {
    persistClientDeviceId(existing);
    return existing;
  }

  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
  const normalized = normalizeClientDeviceId(generated) || generated.slice(0, 32);
  persistClientDeviceId(normalized);
  return normalized;
}

function stubCreateBooking(data: BookingForm) {
  return new Promise<{ id: string }>((resolve) => {
    setTimeout(() => {
      resolve({ id: `BK-${Date.now().toString().slice(-6)}` });
    }, 800);
  });
}

export default function BookingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(initialFieldErrors);
  const [slots, setSlots] = useState<
    { start: string; label: string; remainingCapacity: number; isAvailable: boolean }[]
  >([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlotDate, setSelectedSlotDate] = useState("");
  const [giftCardCheck, setGiftCardCheck] = useState<GiftCardCheckState>({ status: "idle" });
  const [clientDeviceId, setClientDeviceId] = useState("");
  const router = useRouter();

  const filteredPackages = useMemo(() => {
    if (!form.city || !form.category || !form.vehicleSize) return [];
    const matchSize = form.vehicleSize === "minivan" ? "large_suv" : form.vehicleSize;
    return packages.filter(
      (item) =>
        item.city === form.city && item.category === form.category && item.vehicleSize === matchSize
    );
  }, [form.city, form.category, form.vehicleSize]);

  const filteredAddOns = useMemo(() => {
    if (!form.city) return [];
    const matchSize = form.vehicleSize === "minivan" ? "large_suv" : form.vehicleSize;
    return addOns.filter((item) => {
      if (item.city !== form.city) return false;
      if (!item.vehicleSize) return true;
      if (!matchSize) return false;
      return item.vehicleSize === matchSize;
    });
  }, [form.city, form.vehicleSize]);

  const selectedPackage = packages.find((item) => item.id === form.packageId);
  const selectedAddOns = addOns.filter((item) => form.addOnIds.includes(item.id));

  const totalCents = useMemo(() => {
    const pkg = selectedPackage?.priceCents ?? 0;
    const addOnsTotal = selectedAddOns.reduce((sum, item) => sum + item.priceCents, 0);
    return pkg + addOnsTotal;
  }, [selectedPackage, selectedAddOns]);

  const estimatedDurationMins = useMemo(() => {
    return selectedPackage?.durationMins ?? 0;
  }, [selectedPackage]);

  const showRunningTotal = step >= 1 && step <= 4;

  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return form.vehicleSize !== "";
      case 1:
        return form.category !== "" && form.packageId !== "";
      case 2:
        return true;
      case 3:
        return form.bookingStart !== "";
      case 4:
        return Object.keys(validateCustomerFields(form)).length === 0;
      default:
        return false;
    }
  }, [form, step]);

  const goNext = () => {
    if (step < steps.length - 1) setStep((prev) => prev + 1);
  };

  const goBack = () => {
    if (step > 0) setStep((prev) => prev - 1);
  };

  const toggleAddOn = (id: string) => {
    setForm((prev) => {
      const exists = prev.addOnIds.includes(id);
      return {
        ...prev,
        addOnIds: exists ? prev.addOnIds.filter((item) => item !== id) : [...prev.addOnIds, id],
      };
    });
  };

  useEffect(() => {
    setClientDeviceId(getOrCreateClientDeviceId());
  }, []);

  useEffect(() => {
    if (step !== 3 || !selectedPackage?.id) return;
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    fetch(
      `/api/availability?location=${form.city}&serviceId=${selectedPackage.id}&durationMins=${selectedPackage.durationMins}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const nextSlots = data.slots ?? [];
        setSlots(nextSlots);
        if (nextSlots.length > 0) {
          const firstDate = String(nextSlots[0].start).slice(0, 10);
          setSelectedSlotDate((prev) => prev || firstDate);
        }
      })
      .catch(() => {
        if (!active) return;
        setSlotsError("Unable to load availability. Please try again.");
      })
      .finally(() => {
        if (!active) return;
        setSlotsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [step, form.city, selectedPackage?.id]);

  const availableDates = useMemo(() => {
    const unique = Array.from(new Set(slots.map((slot) => String(slot.start).slice(0, 10))));
    return unique.sort();
  }, [slots]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedSlotDate) return [];
    return slots.filter((slot) => String(slot.start).slice(0, 10) === selectedSlotDate);
  }, [slots, selectedSlotDate]);

  const verifyGiftCard = async () => {
    const normalizedGiftCard = normalizeGiftCardNumber(form.giftCardNumber);
    if (!normalizedGiftCard) {
      setFieldErrors((prev) => ({
        ...prev,
        giftCardNumber: "Enter a gift card number to verify.",
      }));
      setGiftCardCheck({ status: "idle" });
      return;
    }

    setFieldErrors((prev) => ({ ...prev, giftCardNumber: undefined }));
    setGiftCardCheck({ status: "checking" });

    try {
      const response = await fetch("/api/gift-cards/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gan: normalizedGiftCard }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        const message = data?.error || "Gift card verification is unavailable right now.";
        setGiftCardCheck({ status: "error", message });
        return;
      }

      if (!data.valid) {
        setGiftCardCheck({
          status: "invalid",
          message: data?.message || "Gift card not found.",
        });
        return;
      }

      setGiftCardCheck({
        status: "valid",
        message: data?.message || "Gift card verified.",
        normalizedGan: data?.normalizedGan,
        cardId: data?.cardId,
        last4: data?.last4,
        balanceAmount: data?.balanceAmount,
        currency: data?.currency,
      });
    } catch {
      setGiftCardCheck({
        status: "error",
        message: "Gift card verification failed. Please try again.",
      });
    }
  };

  const handleSubmit = async () => {
    const normalizedFullName = normalizeFullName(form.fullName);
    const normalizedEmail = normalizeEmail(form.email);
    const normalizedForm = {
      ...form,
      fullName: normalizedFullName,
      email: normalizedEmail,
    };
    const nextErrors = validateCustomerFields(normalizedForm);
    const normalizedPhone = normalizePhone(form.phone);
    const trimmedEmail = normalizedEmail.trim();
    const normalizedGiftCard = normalizeGiftCardNumber(form.giftCardNumber);

    if (
      normalizedGiftCard &&
      (giftCardCheck.status !== "valid" || giftCardCheck.normalizedGan !== normalizedGiftCard)
    ) {
      nextErrors.giftCardNumber = "Please verify your gift card number before confirming.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setForm((prev) => ({
        ...prev,
        fullName: normalizedFullName,
        email: normalizedEmail,
        submitError: "Please fix the highlighted fields.",
      }));
      return;
    }

    setLoading(true);
    setForm((prev) => ({
      ...prev,
      fullName: normalizedFullName,
      email: normalizedEmail,
      submitError: "",
    }));

    const vehicleYear = form.vehicleYear ? Number(form.vehicleYear) : undefined;
    const selectedAddOnDetails = selectedAddOns.map((addon) => ({
      id: addon.id,
      name: addon.name,
      priceCents: addon.priceCents,
      durationMins: addon.durationMins,
    }));

    const intakeAnswers =
      normalizedGiftCard && giftCardCheck.status === "valid"
        ? {
            giftCard: {
              verified: true,
              cardId: giftCardCheck.cardId || null,
              last4: giftCardCheck.last4 || normalizedGiftCard.slice(-4),
              balanceAmount:
                typeof giftCardCheck.balanceAmount === "number"
                  ? giftCardCheck.balanceAmount
                  : null,
              currency: giftCardCheck.currency || null,
            },
          }
        : undefined;

    const payload = {
      locationCode: form.city,
      serviceId: selectedPackage?.id ?? "",
      serviceName: selectedPackage?.name ?? "",
      serviceDescription: selectedPackage?.description ?? "",
      servicePriceCents: selectedPackage?.priceCents ?? 0,
      serviceDurationMins: selectedPackage?.durationMins ?? 0,
      addOnIds: form.addOnIds,
      addOnsDetailed: selectedAddOnDetails,
      bookingStart: form.bookingStart,
      slotLabel: form.slotLabel,
      vehicleSize: form.vehicleSize,
      customer: {
        fullName: normalizedFullName,
        phone: normalizedPhone,
        email: trimmedEmail,
      },
      vehicle: {
        year: Number.isFinite(vehicleYear) ? vehicleYear : undefined,
        make: form.vehicleMake,
        model: form.vehicleModel,
        trim: form.vehicleTrim,
        color: form.vehicleColor,
      },
      clientDeviceId: clientDeviceId || undefined,
      intakeAnswers,
      notes: form.notes,
    };

    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data?.error || "Unable to book that time. Please try another slot.";
      setForm((prev) => ({ ...prev, submitError: message }));
      if (response.status === 409) {
        setForm((prev) => ({ ...prev, bookingStart: "", slotLabel: "" }));
        setStep(3);
      }
      setLoading(false);
      return;
    }

    const result = await response.json().catch(() => null);
    const draft = {
      ...form,
      bookingId: result?.id ?? "",
      totalCents,
      estimatedDurationMins,
    };
    sessionStorage.setItem("bookingDraft", JSON.stringify(draft));
    setLoading(false);
    router.push("/booking/confirmation");
  };

  const summaryCard = (
    <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 lg:sticky lg:top-6">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Booking summary</p>
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">City</p>
        <p className="font-semibold">{form.city ? cityLabel[form.city] : "Not selected"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Service</p>
        <p className="font-semibold">{selectedPackage?.name || "Not selected"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Date & Time</p>
        <p className="font-semibold">{form.slotLabel || "Not selected"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Vehicle</p>
        <p className="font-semibold">
          {form.vehicleYear || ""} {form.vehicleMake || ""} {form.vehicleModel || ""}
        </p>
        {form.vehicleSize && (
          <p className="text-xs text-slate-500">Size: {vehicleSizeLabel[form.vehicleSize]}</p>
        )}
      </div>
      {form.notes && (
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Notes</p>
          <p>{form.notes}</p>
        </div>
      )}
      <div className="border-t border-slate-200 pt-3">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Estimated Total</p>
        <p className="text-lg font-semibold text-slate-900">{formatPrice(totalCents)}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.15em] text-slate-500">Estimated Time</p>
        <p className="font-semibold text-slate-900">{formatDuration(estimatedDurationMins)}</p>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Booking</p>
            <h1 className="text-3xl font-semibold text-slate-900">Book your detail</h1>
            <p className="text-slate-600">
              Select an available time slot to confirm your appointment.
            </p>
            <p className="text-sm text-slate-500">
              Need help? Call/Text{" "}
              <a href="tel:+13067005599" className="font-semibold text-slate-700 underline">
                +1 306 700 5599
              </a>{" "}
              or email{" "}
              <a
                href="mailto:contact@yxequickclean.ca"
                className="font-semibold text-slate-700 underline"
              >
                contact@yxequickclean.ca
              </a>
            </p>
          </header>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <span>{steps[step]}</span>
            </div>
            <div
              className="mt-3 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            >
              {steps.map((label, index) => (
                <div key={label} className="space-y-1">
                  <div
                    className={`h-2 rounded-full ${
                      index <= step ? "bg-slate-900" : "bg-slate-200"
                    }`}
                  />
                  <p className="truncate text-[10px] uppercase tracking-[0.12em] text-slate-400">
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-slate-900 transition-all"
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {step === 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Choose vehicle size</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vehicleSizeOptions.map((option) => (
                  <VehicleSizeCard
                    key={option.id}
                    id={option.id}
                    title={option.title}
                    subtitle={option.subtitle}
                    imageSrc={option.imageSrc}
                    selected={form.vehicleSize === option.id}
                    onSelect={(id) => {
                      setForm((prev) => ({
                        ...prev,
                        vehicleSize: id,
                        category: "",
                        packageId: "",
                      }));
                      setStep(1);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Choose a category</h2>
              <div className="grid gap-3">
                {categoryOptions.map((category) => (
                  <button
                    key={category.id}
                    className={`rounded-2xl border px-5 py-4 text-left transition ${
                      form.category === category.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-800"
                    }`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        category: category.id,
                        packageId: "",
                      }))
                    }
                  >
                    <p className="text-sm uppercase tracking-[0.15em] opacity-70">Category</p>
                    <p className="text-lg font-semibold">{category.label}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Choose a service</p>
                <div className="grid gap-3">
                  {filteredPackages.map((pkg) => (
                    <button
                      key={pkg.id}
                      className={`rounded-2xl border px-5 py-4 text-left transition ${
                        form.packageId === pkg.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                      onClick={() => {
                        setForm((prev) => ({ ...prev, packageId: pkg.id }));
                        setStep(2);
                      }}
                      disabled={!form.category}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">{pkg.name}</p>
                        <p className="text-lg font-semibold">{formatPrice(pkg.priceCents)}</p>
                      </div>
                      <p className="mt-1 text-sm opacity-80">{pkg.description}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] opacity-60">
                        {formatDuration(pkg.durationMins)}
                      </p>
                    </button>
                  ))}
                  {form.category === "" && (
                    <p className="text-sm text-slate-500">Select a category to see pricing.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Add-ons (optional)</h2>
              <div className="grid gap-3">
                {filteredAddOns.map((addon) => {
                  const selected = form.addOnIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      className={`rounded-2xl border px-5 py-4 text-left transition ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                      onClick={() => toggleAddOn(addon.id)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">{addon.name}</p>
                        <p className="text-lg font-semibold">{formatPrice(addon.priceCents)}</p>
                      </div>
                      <p className="mt-1 text-sm opacity-80">{addon.description}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] opacity-60">
                        + {formatDuration(addon.durationMins)}
                      </p>
                    </button>
                  );
                })}
                <button
                  className={`rounded-2xl border px-5 py-4 text-left transition ${
                    form.addOnIds.length === 0
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-800"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, addOnIds: [] }))}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">No add-on needed</p>
                  </div>
                  <p className="mt-1 text-sm opacity-80">Continue without any add-ons.</p>
                </button>
                {filteredAddOns.length === 0 && (
                  <p className="text-sm text-slate-500">No add-ons available yet.</p>
                )}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Choose a time slot</h2>
              <p className="text-sm text-slate-600">
                Select an available time slot to confirm your appointment.
              </p>
              <p className="text-sm text-slate-600">Only showing the next 3 weeks.</p>
              {slotsError && <p className="text-sm text-rose-500">{slotsError}</p>}
              {slotsLoading && (
                <div className="grid gap-3">
                  <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                  <div className="grid gap-2 md:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 animate-pulse rounded-xl border border-slate-200 bg-white"
                      />
                    ))}
                  </div>
                </div>
              )}
              {!slotsLoading && slots.length === 0 && (
                <p className="text-sm text-slate-500">No slots available right now.</p>
              )}
              {!slotsLoading && slots.length > 0 && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={selectedSlotDate}
                      min={availableDates[0]}
                      max={availableDates[availableDates.length - 1]}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        setSelectedSlotDate(nextDate);
                        setForm((prev) => ({ ...prev, bookingStart: "", slotLabel: "" }));
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-700">
                      {selectedSlotDate || "Choose a date"}
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {slotsForSelectedDate.length === 0 && (
                        <p className="text-sm text-slate-500">No times available for this date.</p>
                      )}
                      {slotsForSelectedDate.map((slot) => (
                        <button
                          key={slot.start}
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              bookingStart: slot.start,
                              slotLabel: slot.label,
                            }));
                            setStep(4);
                          }}
                          disabled={!slot.isAvailable}
                          className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                            form.bookingStart === slot.start
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-800"
                          } ${!slot.isAvailable ? "cursor-not-allowed opacity-50" : "hover:border-slate-300"}`}
                        >
                          <span>{slot.label.split(" — ")[1]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Customer + review</h2>
              <p className="text-sm text-slate-500">
                Fields marked * (required) are needed to complete booking.
              </p>
              {form.submitError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {form.submitError}
                </p>
              )}
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Full Name * (required)
                  </label>
                  <input
                    value={form.fullName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, fullName: event.target.value }))
                    }
                    onBlur={() =>
                      setForm((prev) => {
                        const normalizedFullName = normalizeFullName(prev.fullName);
                        const nextForm = { ...prev, fullName: normalizedFullName };
                        setFieldErrors((prevErrors) => ({
                          ...prevErrors,
                          fullName: validateCustomerFields(nextForm).fullName,
                        }));
                        return nextForm;
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.fullName ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="Alex Johnson"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.fullName)}
                  />
                  {fieldErrors.fullName && (
                    <p className="text-sm text-rose-600">{fieldErrors.fullName}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Phone * (required)
                  </label>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        phone: validateCustomerFields(form).phone,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.phone ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="3065550199"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.phone)}
                  />
                  {fieldErrors.phone && (
                    <p className="text-sm text-rose-600">{fieldErrors.phone}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Email * (required)
                  </label>
                  <input
                    value={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    onBlur={() =>
                      setForm((prev) => {
                        const normalizedEmail = normalizeEmail(prev.email);
                        const nextForm = { ...prev, email: normalizedEmail };
                        setFieldErrors((prevErrors) => ({
                          ...prevErrors,
                          email: validateCustomerFields(nextForm).email,
                        }));
                        return nextForm;
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.email ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="alex@email.com"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.email)}
                  />
                  {fieldErrors.email && (
                    <p className="text-sm text-rose-600">{fieldErrors.email}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Vehicle Year (optional)
                  </label>
                  <input
                    value={form.vehicleYear}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vehicleYear: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleYear: validateCustomerFields(form).vehicleYear,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.vehicleYear ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="2020"
                  />
                  {fieldErrors.vehicleYear && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleYear}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Make * (required)
                  </label>
                  <input
                    value={form.vehicleMake}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vehicleMake: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleMake: validateCustomerFields(form).vehicleMake,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.vehicleMake ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="Toyota"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.vehicleMake)}
                  />
                  {fieldErrors.vehicleMake && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleMake}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Model * (required)
                  </label>
                  <input
                    value={form.vehicleModel}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vehicleModel: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleModel: validateCustomerFields(form).vehicleModel,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.vehicleModel ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="RAV4"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.vehicleModel)}
                  />
                  {fieldErrors.vehicleModel && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleModel}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Trim (optional)
                  </label>
                  <input
                    value={form.vehicleTrim}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vehicleTrim: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleTrim: validateCustomerFields(form).vehicleTrim,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.vehicleTrim ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="XLE"
                  />
                  {fieldErrors.vehicleTrim && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleTrim}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Color (optional)
                  </label>
                  <input
                    value={form.vehicleColor}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, vehicleColor: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        vehicleColor: validateCustomerFields(form).vehicleColor,
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.vehicleColor ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="Midnight Blue"
                  />
                  {fieldErrors.vehicleColor && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleColor}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Square Gift Card Number (optional)
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={form.giftCardNumber}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, giftCardNumber: event.target.value }));
                        setFieldErrors((prev) => ({ ...prev, giftCardNumber: undefined }));
                        setGiftCardCheck({ status: "idle" });
                      }}
                      onBlur={() =>
                        setFieldErrors((prev) => ({
                          ...prev,
                          giftCardNumber: validateCustomerFields(form).giftCardNumber,
                        }))
                      }
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                        fieldErrors.giftCardNumber
                          ? "border-rose-400 bg-rose-50"
                          : "border-slate-200"
                      }`}
                      placeholder="Enter gift card number"
                      aria-invalid={Boolean(fieldErrors.giftCardNumber)}
                    />
                    <button
                      type="button"
                      onClick={() => void verifyGiftCard()}
                      disabled={giftCardCheck.status === "checking"}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {giftCardCheck.status === "checking" ? "Verifying..." : "Verify"}
                    </button>
                  </div>
                  {fieldErrors.giftCardNumber && (
                    <p className="text-sm text-rose-600">{fieldErrors.giftCardNumber}</p>
                  )}
                  {giftCardCheck.status === "valid" && (
                    <p className="text-sm text-emerald-700">
                      Gift card verified ending in {giftCardCheck.last4 || "----"}
                      {typeof giftCardCheck.balanceAmount === "number" && giftCardCheck.currency
                        ? ` · Balance ${(giftCardCheck.balanceAmount / 100).toLocaleString(
                            "en-CA",
                            {
                              style: "currency",
                              currency: giftCardCheck.currency,
                            }
                          )}`
                        : ""}
                    </p>
                  )}
                  {giftCardCheck.status === "invalid" && (
                    <p className="text-sm text-rose-600">{giftCardCheck.message}</p>
                  )}
                  {giftCardCheck.status === "error" && (
                    <p className="text-sm text-rose-600">{giftCardCheck.message}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Notes (optional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        notes: validateCustomerFields(form).notes,
                      }))
                    }
                    className={`min-h-[90px] rounded-xl border px-3 py-2 text-sm ${
                      fieldErrors.notes ? "border-rose-400 bg-rose-50" : "border-slate-200"
                    }`}
                    placeholder="Anything we should know?"
                  />
                  {fieldErrors.notes && (
                    <p className="text-sm text-rose-600">{fieldErrors.notes}</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">City</p>
                  <p className="text-base font-semibold">{form.city ? cityLabel[form.city] : ""}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Service</p>
                  <p className="text-base font-semibold">{selectedPackage?.name}</p>
                  <p className="text-slate-500">{selectedPackage?.description}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Add-ons</p>
                  {selectedAddOns.length === 0 ? (
                    <p className="text-slate-500">None</p>
                  ) : (
                    selectedAddOns.map((addon) => (
                      <p key={addon.id} className="text-base">
                        {addon.name} · {formatPrice(addon.priceCents)}
                      </p>
                    ))
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Date & Time</p>
                  <p className="text-base font-semibold">{form.slotLabel}</p>
                </div>
                {giftCardCheck.status === "valid" && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Gift Card</p>
                    <p className="text-base font-semibold">
                      Verified ending in {giftCardCheck.last4 || "----"}
                    </p>
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Vehicle</p>
                  <p className="text-base font-semibold">
                    {form.vehicleYear} {form.vehicleMake} {form.vehicleModel}
                  </p>
                  {form.vehicleSize && (
                    <p className="text-sm text-slate-500">
                      Size: {vehicleSizeLabel[form.vehicleSize]}
                    </p>
                  )}
                  {form.vehicleTrim && <p>Trim: {form.vehicleTrim}</p>}
                  {form.vehicleColor && <p>Color: {form.vehicleColor}</p>}
                </div>
                {form.notes && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Notes</p>
                    <p>{form.notes}</p>
                  </div>
                )}
                <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Estimated Total
                  </p>
                  <p className="text-lg font-semibold text-slate-900">{formatPrice(totalCents)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Estimated Time
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {formatDuration(estimatedDurationMins)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  onClick={goBack}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  className="flex-[2] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? "Confirming..." : "Confirm booking"}
                </button>
              </div>
            </section>
          )}

          {showRunningTotal && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Current total</p>
              <p className="text-base font-semibold text-slate-900">{formatPrice(totalCents)}</p>
            </div>
          )}

          {step < steps.length - 1 && (
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
                  onClick={goBack}
                >
                  Back
                </button>
              )}
              {step === 2 && (
                <button
                  className="flex-[1.5] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={goNext}
                  disabled={!canContinue}
                >
                  Continue
                </button>
              )}
            </div>
          )}
        </div>
        <div className="hidden lg:block">{summaryCard}</div>
      </div>
    </main>
  );
}
