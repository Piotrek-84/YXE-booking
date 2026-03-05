"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ServiceTag from "../../components/ServiceTag";
import VehicleSizeCard from "../../components/VehicleSizeCard";
import {
  addOns,
  type CityCode,
  formatDuration,
  formatPrice,
  packages,
} from "../../lib/booking-data";
import {
  computeDiscountAmountCents,
  isDiscountCodeFormatValid,
  normalizeDiscountCode,
} from "../../lib/discount-codes";
import { normalizePhone } from "../../lib/phone";

const steps = ["Vehicle Size", "Category", "Add-ons", "Date & Time", "Customer & Review"];

const categoryOptions = [
  { id: "INT_EXT", label: "Interior & Exterior", tagLabel: "Most Popular" },
  { id: "INT_ONLY", label: "Interior Only", tagLabel: "" },
  { id: "EXT_ONLY", label: "Exterior Only", tagLabel: "" },
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
  discountCode: string;
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
    | "discountCode"
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

type DiscountCheckState = {
  status: "idle" | "checking" | "valid" | "invalid" | "error";
  message?: string;
  normalizedCode?: string;
  discountType?: "PERCENTAGE" | "FIXED_CENTS";
  percentOff?: number | null;
  fixedAmountCents?: number | null;
  description?: string | null;
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
  discountCode: "",
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
  return value.trim().toLowerCase();
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  if (form.discountCode.trim().length > 0) {
    const normalizedCode = normalizeDiscountCode(form.discountCode);
    if (!isDiscountCodeFormatValid(normalizedCode)) {
      errors.discountCode = "Enter a valid discount code.";
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
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(initialFieldErrors);
  const [slots, setSlots] = useState<
    { start: string; label: string; remainingCapacity: number; isAvailable: boolean }[]
  >([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlotDate, setSelectedSlotDate] = useState("");
  const [giftCardCheck, setGiftCardCheck] = useState<GiftCardCheckState>({ status: "idle" });
  const [discountCheck, setDiscountCheck] = useState<DiscountCheckState>({ status: "idle" });
  const [clientDeviceId, setClientDeviceId] = useState("");
  const router = useRouter();
  const minBookableDateKey = useMemo(() => toLocalDateKey(new Date()), []);
  const maxBookableDateKey = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 21);
    return toLocalDateKey(end);
  }, []);

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
    return addOns
      .filter((item) => {
        if (item.city !== form.city) return false;
        if (!item.vehicleSize) return true;
        if (!matchSize) return false;
        return item.vehicleSize === matchSize;
      })
      .sort((a, b) => {
        const getPriority = (id: string) => {
          if (id === "yxe-paint-sealant") return 0;
          if (id === "yxe-windshield-ceramic") return 1;
          if (id.startsWith("yxe-ceramic-leather-plastic-protectant")) return 2;
          return 3;
        };
        const aPriority = getPriority(a.id);
        const bPriority = getPriority(b.id);
        return aPriority - bPriority;
      });
  }, [form.city, form.vehicleSize]);

  const selectedPackage = packages.find((item) => item.id === form.packageId);
  const selectedAddOns = addOns.filter((item) => form.addOnIds.includes(item.id));

  const subtotalCents = useMemo(() => {
    const pkg = selectedPackage?.priceCents ?? 0;
    const addOnsTotal = selectedAddOns.reduce((sum, item) => sum + item.priceCents, 0);
    return pkg + addOnsTotal;
  }, [selectedPackage, selectedAddOns]);

  const discountCents = useMemo(() => {
    const normalizedCode = normalizeDiscountCode(form.discountCode);
    if (
      discountCheck.status !== "valid" ||
      !discountCheck.normalizedCode ||
      normalizedCode !== discountCheck.normalizedCode ||
      !discountCheck.discountType
    ) {
      return 0;
    }
    return computeDiscountAmountCents(subtotalCents, {
      discountType: discountCheck.discountType,
      percentOff: discountCheck.percentOff,
      fixedAmountCents: discountCheck.fixedAmountCents,
    });
  }, [discountCheck, form.discountCode, subtotalCents]);

  const totalCents = useMemo(
    () => Math.max(0, subtotalCents - discountCents),
    [subtotalCents, discountCents]
  );

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
        const nextSlotsRaw: {
          start: string;
          label: string;
          remainingCapacity: number;
          isAvailable: boolean;
        }[] = Array.isArray(data?.slots) ? data.slots : [];

        const nextSlots = nextSlotsRaw.filter((slot) => {
          const dateKey = String(slot.start).slice(0, 10);
          return dateKey >= minBookableDateKey && dateKey <= maxBookableDateKey;
        });

        setSlots(nextSlots);
        const availableSlotStarts = new Set(nextSlots.map((slot) => slot.start));
        const availableDates: string[] = Array.from(
          new Set(nextSlots.map((slot) => String(slot.start).slice(0, 10)))
        ).sort();
        const firstDate = availableDates[0] || "";

        setSelectedSlotDate((prev) => {
          if (!firstDate) return "";
          if (!prev) return firstDate;
          return availableDates.includes(prev) ? prev : firstDate;
        });

        setForm((prev) => {
          if (!prev.bookingStart) return prev;
          if (availableSlotStarts.has(prev.bookingStart)) return prev;
          return { ...prev, bookingStart: "", slotLabel: "" };
        });
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
  }, [step, form.city, selectedPackage?.id, minBookableDateKey, maxBookableDateKey]);

  const availableDates = useMemo(() => {
    const unique = Array.from(new Set(slots.map((slot) => String(slot.start).slice(0, 10))));
    return unique.sort();
  }, [slots]);

  const datePickerMin = availableDates[0] || minBookableDateKey;
  const datePickerMax = availableDates[availableDates.length - 1] || maxBookableDateKey;

  useEffect(() => {
    if (!selectedSlotDate) return;
    if (selectedSlotDate >= datePickerMin && selectedSlotDate <= datePickerMax) return;
    const fallbackDate = availableDates[0] || "";
    setSelectedSlotDate(fallbackDate);
    setForm((prev) => ({ ...prev, bookingStart: "", slotLabel: "" }));
  }, [availableDates, datePickerMax, datePickerMin, selectedSlotDate]);

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

  const verifyDiscountCode = async () => {
    const normalizedCode = normalizeDiscountCode(form.discountCode);
    if (!normalizedCode) {
      setFieldErrors((prev) => ({
        ...prev,
        discountCode: "Enter a discount code to apply.",
      }));
      setDiscountCheck({ status: "idle" });
      return;
    }

    if (!isDiscountCodeFormatValid(normalizedCode)) {
      setFieldErrors((prev) => ({
        ...prev,
        discountCode: "Enter a valid discount code.",
      }));
      setDiscountCheck({ status: "invalid", message: "Discount code format is invalid." });
      return;
    }

    setFieldErrors((prev) => ({ ...prev, discountCode: undefined }));
    setDiscountCheck({ status: "checking" });

    try {
      const response = await fetch("/api/discount-codes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          subtotalCents,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        const message = data?.error || "Discount verification is unavailable right now.";
        setDiscountCheck({ status: "error", message });
        return;
      }

      if (!data.valid) {
        setDiscountCheck({
          status: "invalid",
          message: data?.message || "Discount code is not valid.",
        });
        return;
      }

      setDiscountCheck({
        status: "valid",
        message: data?.message || "Discount code applied.",
        normalizedCode,
        discountType: data?.discountType,
        percentOff: typeof data?.percentOff === "number" ? data.percentOff : null,
        fixedAmountCents: typeof data?.fixedAmountCents === "number" ? data.fixedAmountCents : null,
        description: data?.description || null,
      });
    } catch {
      setDiscountCheck({
        status: "error",
        message: "Discount verification failed. Please try again.",
      });
    }
  };

  const handleSubmit = async () => {
    if (!hasAcceptedTerms) {
      setTermsError("Please accept the terms and conditions before confirming.");
      return;
    }

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
    const normalizedDiscountCode = normalizeDiscountCode(form.discountCode);

    if (
      normalizedGiftCard &&
      (giftCardCheck.status !== "valid" || giftCardCheck.normalizedGan !== normalizedGiftCard)
    ) {
      nextErrors.giftCardNumber = "Please verify your gift card number before confirming.";
    }
    if (
      normalizedDiscountCode &&
      (discountCheck.status !== "valid" || discountCheck.normalizedCode !== normalizedDiscountCode)
    ) {
      nextErrors.discountCode = "Please apply a valid discount code before confirming.";
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
            ...(normalizedDiscountCode && discountCheck.status === "valid"
              ? {
                  discountCode: {
                    code: normalizedDiscountCode,
                  },
                }
              : {}),
          }
        : normalizedDiscountCode && discountCheck.status === "valid"
          ? {
              discountCode: {
                code: normalizedDiscountCode,
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
      discountCode: normalizedDiscountCode || undefined,
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
      subtotalCents: result?.pricing?.subtotalCents ?? subtotalCents,
      discountCents: result?.pricing?.discountCents ?? discountCents,
      totalCents: result?.pricing?.finalTotalCents ?? totalCents,
      appliedDiscount: result?.appliedDiscount ?? null,
      estimatedDurationMins,
    };
    try {
      sessionStorage.setItem("bookingDraft", JSON.stringify(draft));
    } catch {}
    try {
      localStorage.setItem("bookingDraft", JSON.stringify(draft));
    } catch {}
    setLoading(false);
    router.push("/booking/confirmation");
  };

  const summaryCard = (
    <aside className="space-y-3 rounded-2xl border border-brand-text/25 bg-white p-4 text-sm text-brand-text lg:sticky lg:top-6">
      <p className="text-[0.86rem] uppercase tracking-[0.18em] text-brand-text/85">Booking summary</p>
      <div>
        <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">City</p>
        <p className="font-semibold">{form.city ? cityLabel[form.city] : "Not selected"}</p>
      </div>
      <div>
        <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Service</p>
        <p className="font-semibold">{selectedPackage?.name || "Not selected"}</p>
      </div>
      <div>
        <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Date & Time</p>
        <p className="font-semibold">{form.slotLabel || "Not selected"}</p>
      </div>
      <div>
        <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Vehicle</p>
        <p className="font-semibold">
          {form.vehicleYear || ""} {form.vehicleMake || ""} {form.vehicleModel || ""}
        </p>
        {form.vehicleSize && (
          <p className="text-[0.86rem] text-brand-text/85">Size: {vehicleSizeLabel[form.vehicleSize]}</p>
        )}
      </div>
      {form.notes && (
        <div>
          <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Notes</p>
          <p>{form.notes}</p>
        </div>
      )}
      <div className="border-t border-brand-text/25 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Subtotal</p>
          <p className="font-semibold text-brand-text">{formatPrice(subtotalCents)}</p>
        </div>
        {discountCents > 0 && (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[0.86rem] uppercase tracking-[0.15em] text-emerald-700">Discount</p>
            <p className="font-semibold text-emerald-700">-{formatPrice(discountCents)}</p>
          </div>
        )}
        <p className="mt-3 text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
          Estimated Total
        </p>
        <p className="text-lg font-semibold text-brand-text">{formatPrice(totalCents)}</p>
        <p className="mt-2 text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
          Estimated Time
        </p>
        <p className="font-semibold text-brand-text">{formatDuration(estimatedDurationMins)}</p>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-brand-bg px-5 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="space-y-3">
            <h1 className="text-3xl font-semibold text-brand-text">Book your detail</h1>
            <p className="text-brand-text/85">
              Start by selecting the vehicle you will be bringing in.
            </p>
            <p className="text-[1rem] text-brand-text/85">
              Need help? Call/Text{" "}
              <a href="tel:+13067005599" className="font-semibold text-brand-text underline">
                +1 306 700 5599
              </a>{" "}
              or email{" "}
              <a
                href="mailto:contact@yxequickclean.ca"
                className="font-semibold text-brand-text underline"
              >
                contact@yxequickclean.ca
              </a>
            </p>
          </header>

          <div className="rounded-2xl border border-brand-text/25 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[0.86rem] uppercase tracking-[0.18em] text-brand-text/80">
              <span>
                Step {step + 1} of {steps.length}
              </span>
              <span>{steps[step]}</span>
            </div>
            <div
              className="mt-3 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            >
              {steps.map((label, index) => {
                const isClickable = index <= step;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (isClickable) setStep(index);
                    }}
                    disabled={!isClickable}
                    aria-current={index === step ? "step" : undefined}
                    className={`space-y-1 text-left ${isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                  >
                    <div
                      className={`h-2 rounded-full ${
                        index <= step ? "bg-brand-text" : "bg-brand-text/25"
                      }`}
                    />
                    <p
                      className={`truncate text-[11.5px] uppercase tracking-[0.12em] ${
                        index <= step ? "text-brand-text/85" : "text-brand-text/80"
                      }`}
                    >
                      {label}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-brand-text/10">
              <div
                className="h-2 rounded-full bg-brand-text transition-all"
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
                        ? "border-brand-text bg-brand-text text-white"
                        : "border-brand-text/25 bg-white text-brand-text"
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{category.label}</p>
                      {category.tagLabel && <ServiceTag label={category.tagLabel} />}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-brand-text">Choose a service</p>
                <div className="grid gap-3">
                  {filteredPackages.map((pkg) => (
                    <button
                      key={pkg.id}
                      className={`rounded-2xl border px-5 py-4 text-left transition ${
                        form.packageId === pkg.id
                          ? "border-brand-text bg-brand-text text-white"
                          : "border-brand-text/25 bg-white text-brand-text"
                      }`}
                      onClick={() => {
                        setForm((prev) => ({ ...prev, packageId: pkg.id }));
                        setStep(2);
                      }}
                      disabled={!form.category}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold sm:text-lg">{pkg.name}</p>
                          {pkg.tagLabel && <ServiceTag label={pkg.tagLabel} className="mt-2" />}
                        </div>
                        <p className="shrink-0 whitespace-nowrap text-base font-semibold sm:text-lg">
                          {formatPrice(pkg.priceCents)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm opacity-95">{pkg.description}</p>
                      <p className="mt-2 text-[0.86rem] uppercase tracking-[0.18em] opacity-80">
                        {formatDuration(pkg.durationMins)}
                      </p>
                    </button>
                  ))}
                  {form.category === "" && (
                    <p className="text-[1rem] text-brand-text/85">Select a category to see pricing.</p>
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
                  const showCeramicSurchargeNote =
                    addon.id.startsWith("yxe-ceramic-fabric-protectant") ||
                    addon.id.startsWith("yxe-ceramic-leather-plastic-protectant");
                  return (
                    <button
                      key={addon.id}
                      className={`rounded-2xl border px-5 py-4 text-left transition ${
                        selected
                          ? "border-brand-text bg-brand-text text-white"
                          : "border-brand-text/25 bg-white text-brand-text"
                      }`}
                      onClick={() => toggleAddOn(addon.id)}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold sm:text-lg">{addon.name}</p>
                          {addon.tagLabel && <ServiceTag label={addon.tagLabel} className="mt-2" />}
                        </div>
                        <p className="shrink-0 whitespace-nowrap text-base font-semibold sm:text-lg">
                          {formatPrice(addon.priceCents)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm opacity-95">{addon.description}</p>
                      {showCeramicSurchargeNote && (
                        <p
                          className={`mt-1 text-[0.75rem] ${
                            selected ? "text-white/90" : "text-brand-text/80"
                          }`}
                        >
                          $20 up charge for Large SUV and Minivans
                        </p>
                      )}
                      {addon.id === "yxe-ozonator" && (
                        <p className="mt-2 text-[0.86rem] uppercase tracking-[0.18em] opacity-80">+1hr</p>
                      )}
                    </button>
                  );
                })}
                <button
                  className={`rounded-2xl border px-5 py-4 text-left transition ${
                    form.addOnIds.length === 0
                      ? "border-brand-text bg-brand-text text-white"
                      : "border-brand-text/25 bg-white text-brand-text"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, addOnIds: [] }))}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">No add-on needed</p>
                  </div>
                  <p className="mt-1 text-sm opacity-95">Continue without any add-ons.</p>
                </button>
                {filteredAddOns.length === 0 && (
                  <p className="text-[1rem] text-brand-text/85">No add-ons available yet.</p>
                )}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Choose a time slot</h2>
              <p className="text-[1rem] text-brand-text/85">
                Start by selecting the vehicle you will be bringing in.
              </p>
              {slotsError && <p className="text-sm text-rose-500">{slotsError}</p>}
              {slotsLoading && (
                <div className="grid gap-3">
                  <div className="h-24 animate-pulse rounded-2xl border border-brand-text/25 bg-white" />
                  <div className="grid gap-2 md:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 animate-pulse rounded-xl border border-brand-text/25 bg-white"
                      />
                    ))}
                  </div>
                </div>
              )}
              {!slotsLoading && slots.length === 0 && (
                <p className="text-[1rem] text-brand-text/85">No slots available right now.</p>
              )}
              {!slotsLoading && slots.length > 0 && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-brand-text/25 bg-white p-4">
                    <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={selectedSlotDate}
                      min={datePickerMin}
                      max={datePickerMax}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        if (!nextDate) {
                          setSelectedSlotDate("");
                          setForm((prev) => ({ ...prev, bookingStart: "", slotLabel: "" }));
                          return;
                        }

                        let normalizedDate = nextDate;
                        if (normalizedDate < datePickerMin) normalizedDate = datePickerMin;
                        if (normalizedDate > datePickerMax) normalizedDate = datePickerMax;

                        if (!availableDates.includes(normalizedDate)) {
                          normalizedDate =
                            availableDates.find((dateKey) => dateKey >= normalizedDate) ||
                            availableDates[availableDates.length - 1] ||
                            availableDates[0] ||
                            "";
                        }

                        setSelectedSlotDate(normalizedDate);
                        setForm((prev) => ({ ...prev, bookingStart: "", slotLabel: "" }));
                      }}
                      className="mt-2 w-full rounded-xl border border-brand-text/25 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="rounded-2xl border border-brand-text/25 bg-white p-4">
                    <p className="text-sm font-semibold text-brand-text">
                      {selectedSlotDate || "Choose a date"}
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {slotsForSelectedDate.length === 0 && (
                        <p className="text-[1rem] text-brand-text/85">
                          No times available for this date.
                        </p>
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
                              ? "border-brand-text bg-brand-text text-white"
                              : "border-brand-text/25 bg-white text-brand-text"
                          } ${!slot.isAvailable ? "cursor-not-allowed opacity-50" : "hover:border-brand-text/35"}`}
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
              <p className="text-[1rem] text-brand-text/85">
                Fields marked * (required) are needed to complete booking.
              </p>
              {form.submitError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {form.submitError}
                </p>
              )}
              <div className="grid gap-4 rounded-2xl border border-brand-text/25 bg-white p-5">
                <div className="grid gap-3">
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.fullName ? "border-rose-400 bg-rose-50" : "border-brand-text/25"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.phone ? "border-rose-400 bg-rose-50" : "border-brand-text/25"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.email ? "border-rose-400 bg-rose-50" : "border-brand-text/25"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.vehicleYear
                        ? "border-rose-400 bg-rose-50"
                        : "border-brand-text/25"
                    }`}
                    placeholder="2020"
                  />
                  {fieldErrors.vehicleYear && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleYear}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.vehicleMake
                        ? "border-rose-400 bg-rose-50"
                        : "border-brand-text/25"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.vehicleModel
                        ? "border-rose-400 bg-rose-50"
                        : "border-brand-text/25"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.vehicleTrim
                        ? "border-rose-400 bg-rose-50"
                        : "border-brand-text/25"
                    }`}
                    placeholder="XLE"
                  />
                  {fieldErrors.vehicleTrim && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleTrim}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.vehicleColor
                        ? "border-rose-400 bg-rose-50"
                        : "border-brand-text/25"
                    }`}
                    placeholder="Midnight Blue"
                  />
                  {fieldErrors.vehicleColor && (
                    <p className="text-sm text-rose-600">{fieldErrors.vehicleColor}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                          : "border-brand-text/25"
                      }`}
                      placeholder="Enter gift card number"
                      aria-invalid={Boolean(fieldErrors.giftCardNumber)}
                    />
                    <button
                      type="button"
                      onClick={() => void verifyGiftCard()}
                      disabled={giftCardCheck.status === "checking"}
                      className="rounded-xl border border-brand-text/25 px-4 py-2 text-sm font-semibold text-brand-text disabled:opacity-60"
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
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                    Discount Code (optional)
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={form.discountCode}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, discountCode: event.target.value }));
                        setFieldErrors((prev) => ({ ...prev, discountCode: undefined }));
                        setDiscountCheck({ status: "idle" });
                      }}
                      onBlur={() =>
                        setFieldErrors((prev) => ({
                          ...prev,
                          discountCode: validateCustomerFields(form).discountCode,
                        }))
                      }
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                        fieldErrors.discountCode
                          ? "border-rose-400 bg-rose-50"
                          : "border-brand-text/25"
                      }`}
                      placeholder="Enter promo code"
                      aria-invalid={Boolean(fieldErrors.discountCode)}
                    />
                    <button
                      type="button"
                      onClick={() => void verifyDiscountCode()}
                      disabled={discountCheck.status === "checking"}
                      className="rounded-xl border border-brand-text/25 px-4 py-2 text-sm font-semibold text-brand-text disabled:opacity-60"
                    >
                      {discountCheck.status === "checking" ? "Applying..." : "Apply"}
                    </button>
                  </div>
                  {fieldErrors.discountCode && (
                    <p className="text-sm text-rose-600">{fieldErrors.discountCode}</p>
                  )}
                  {discountCheck.status === "valid" && (
                    <p className="text-sm text-emerald-700">
                      {discountCheck.message || "Discount code applied."}
                      {discountCheck.description ? ` · ${discountCheck.description}` : ""}
                      {discountCents > 0 ? ` · -${formatPrice(discountCents)}` : ""}
                    </p>
                  )}
                  {discountCheck.status === "invalid" && (
                    <p className="text-sm text-rose-600">{discountCheck.message}</p>
                  )}
                  {discountCheck.status === "error" && (
                    <p className="text-sm text-rose-600">{discountCheck.message}</p>
                  )}
                </div>
                <div className="grid gap-3">
                  <label className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
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
                      fieldErrors.notes ? "border-rose-400 bg-rose-50" : "border-brand-text/25"
                    }`}
                    placeholder="Anything we should know?"
                  />
                  {fieldErrors.notes && (
                    <p className="text-sm text-rose-600">{fieldErrors.notes}</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-brand-text/25 bg-white p-5 text-sm text-brand-text">
                <div className="space-y-2">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">City</p>
                  <p className="text-base font-semibold">{form.city ? cityLabel[form.city] : ""}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Service</p>
                  <p className="text-base font-semibold">{selectedPackage?.name}</p>
                  <p className="text-brand-text/85">{selectedPackage?.description}</p>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Add-ons</p>
                  {selectedAddOns.length === 0 ? (
                    <p className="text-brand-text/85">None</p>
                  ) : (
                    selectedAddOns.map((addon) => (
                      <p key={addon.id} className="text-base">
                        {addon.name} · {formatPrice(addon.priceCents)}
                      </p>
                    ))
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                    Date & Time
                  </p>
                  <p className="text-base font-semibold">{form.slotLabel}</p>
                </div>
                {giftCardCheck.status === "valid" && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                      Gift Card
                    </p>
                    <p className="text-base font-semibold">
                      Verified ending in {giftCardCheck.last4 || "----"}
                    </p>
                  </div>
                )}
                {discountCents > 0 && discountCheck.status === "valid" && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                      Discount Code
                    </p>
                    <p className="text-base font-semibold">
                      {discountCheck.normalizedCode || normalizeDiscountCode(form.discountCode)} · -
                      {formatPrice(discountCents)}
                    </p>
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Vehicle</p>
                  <p className="text-base font-semibold">
                    {form.vehicleYear} {form.vehicleMake} {form.vehicleModel}
                  </p>
                  {form.vehicleSize && (
                    <p className="text-[1rem] text-brand-text/85">
                      Size: {vehicleSizeLabel[form.vehicleSize]}
                    </p>
                  )}
                  {form.vehicleTrim && <p>Trim: {form.vehicleTrim}</p>}
                  {form.vehicleColor && <p>Color: {form.vehicleColor}</p>}
                </div>
                {form.notes && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Notes</p>
                    <p>{form.notes}</p>
                  </div>
                )}
                <div className="mt-6 flex items-center justify-between border-t border-brand-text/25 pt-4">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">Subtotal</p>
                  <p className="text-base font-semibold text-brand-text">
                    {formatPrice(subtotalCents)}
                  </p>
                </div>
                {discountCents > 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[0.86rem] uppercase tracking-[0.15em] text-emerald-700">Discount</p>
                    <p className="text-base font-semibold text-emerald-700">
                      -{formatPrice(discountCents)}
                    </p>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                    Estimated Total
                  </p>
                  <p className="text-lg font-semibold text-brand-text">{formatPrice(totalCents)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                    Estimated Time
                  </p>
                  <p className="text-base font-semibold text-brand-text">
                    {formatDuration(estimatedDurationMins)}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-brand-text/25 bg-white p-5 text-sm text-brand-text">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={hasAcceptedTerms}
                    onChange={(event) => {
                      setHasAcceptedTerms(event.target.checked);
                      if (event.target.checked) setTermsError("");
                    }}
                    className="mt-1 h-4 w-4 rounded border-brand-text/30"
                  />
                  <span>
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="font-semibold underline"
                    >
                      terms and conditions
                    </button>
                    .
                  </span>
                </label>
                {termsError && <p className="mt-2 text-sm text-rose-600">{termsError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="flex-1 rounded-2xl border border-brand-text/25 px-4 py-3 text-sm font-semibold text-brand-text"
                  onClick={goBack}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  className="flex-[2] rounded-2xl bg-brand-text px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSubmit}
                  disabled={loading || !hasAcceptedTerms}
                >
                  {loading ? "Confirming..." : "Confirm booking"}
                </button>
              </div>
            </section>
          )}

          {showRunningTotal && (
            <div className="flex items-center justify-between rounded-2xl border border-brand-text/25 bg-white px-4 py-3">
              <p className="text-[0.86rem] uppercase tracking-[0.15em] text-brand-text/85">
                Current total
              </p>
              <p className="text-base font-semibold text-brand-text">{formatPrice(totalCents)}</p>
            </div>
          )}

          {step < steps.length - 1 && (
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  className="flex-1 rounded-2xl border border-brand-text/25 px-4 py-3 text-sm font-semibold text-brand-text/85"
                  onClick={goBack}
                >
                  Back
                </button>
              )}
              {step === 2 && (
                <button
                  className="flex-[1.5] rounded-2xl bg-brand-text px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 text-sm text-brand-text shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold">Terms & Conditions</h2>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-xl border border-brand-text/25 px-3 py-1 text-[0.86rem] font-semibold uppercase tracking-[0.08em]"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-semibold">Cancellation policy</p>
                <p className="text-brand-text/85">
                  We require 24 hours notice of a cancellation (you can cancel directly through your
                  email confirmation or call/text us at #306-700-5599). If you cancel with less than
                  24 hours notice we will require pre-payment before your next service. Pre-payment
                  can be made over the phone via credit card or in-shop by credit card, debit or
                  cash.
                </p>
              </div>
              <div>
                <p className="font-semibold">Excessively dirty</p>
                <p className="text-brand-text/85">
                  We reserve the right to charge extra if there is excessive pet hair, or if the
                  vehicle is excessively dirty. Not sure if you fit this category? Check out our
                  blog post (with photos) here:{" "}
                  <a
                    href="https://yxequickclean.ca/blog/f/what-does-excessively-dirty-mean"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    https://yxequickclean.ca/blog/f/what-does-excessively-dirty-mean
                  </a>
                  .
                </p>
              </div>
              <div>
                <p className="font-semibold">Late Arrival</p>
                <p className="text-brand-text/85">
                  Please know that due to the high volume of clientele we see on a daily basis that
                  if you are late for your appointment we may not be able to complete everything
                  listed in the service you chose. You can easily cancel or rebook your appointment
                  by clicking on manage my appointment at the bottom of your confirmation email.
                  Please arrive 10 minutes before your scheduled appointment so we can take a look
                  at your vehicle with you, answer any questions you may have and start cleaning at
                  your appointment time.
                </p>
              </div>
              <div>
                <p className="text-brand-text/85">
                  If you would like the interior of your centre console and glovebox cleaned please
                  completely empty these areas. They will not be cleaned unless they are completely
                  empty. We do not want to throw out anything that is important and generally this
                  is where people store their important items/documents. Please feel free to leave
                  any garbage from these areas on the floor of your vehicle and we will dispose of
                  it.
                </p>
              </div>
              <div>
                <p className="font-semibold">Parking</p>
                <p className="text-brand-text/85">
                  You are responsible for the parking charges incurred while in the Midtown parking
                  lot. Please make sure you hang on to your parking ticket.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
