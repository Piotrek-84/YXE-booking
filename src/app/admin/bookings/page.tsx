"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const statusOptions = [
  "REQUESTED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
] as const;

type BookingStatus = (typeof statusOptions)[number];

type BookingListItem = {
  id: string;
  status: string;
  requestedDate: string;
  requestedWindow: string;
  bookingStartDateTime?: string | null;
  slotKey?: string | null;
  slotSequence?: number | null;
  customerNotes?: string | null;
  adminNotes?: string | null;
  updatedAt: string;
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
  service: { name: string; description?: string };
  addOns?: { addOn: { name: string; priceCents: number } }[];
  audits?: {
    id: string;
    action: string;
    actor?: string | null;
    createdAt: string;
    details?: unknown;
  }[];
  blockedCustomer?: {
    id: string;
    reason?: string | null;
    clientFacingNote?: string | null;
    isActive: boolean;
    isPotentialMaintenance?: boolean;
    maintenanceReason?: string | null;
    maintenanceMarkedAt?: string | null;
    maintenanceMarkedBy?: string | null;
  } | null;
  bookingHistory?: {
    totalVisits: number;
    lastVisit?: {
      startAt?: string | null;
      serviceName?: string | null;
    } | null;
    nextVisit?: {
      startAt?: string | null;
      serviceName?: string | null;
    } | null;
    items: Array<{
      id: string;
      status: string;
      serviceName?: string | null;
      locationName?: string | null;
      startAt?: string | null;
      vehicle?: { year?: number | null; make?: string | null; model?: string | null };
    }>;
  } | null;
  location: { code: string; name: string };
};

type ToastState = { id: number; type: "success" | "error"; message: string } | null;
type PaginationState = { page: number; pageSize: number; total: number; totalPages: number };
type SavedView = {
  id: string;
  name: string;
  location: string;
  status: string;
  date: string;
  search: string;
};

type DrawerForm = {
  status: BookingStatus;
  adminNotes: string;
  dateTime: string;
};

type SlotBlock = {
  id: string;
  slotKey: string;
  slotLine: number;
  reason?: string | null;
  startAt: string;
  endAt: string;
};

function statusBadge(status: string) {
  switch (status) {
    case "REQUESTED":
      return "bg-amber-100 text-amber-800";
    case "CONFIRMED":
      return "bg-sky-100 text-sky-800";
    case "SCHEDULED":
      return "bg-indigo-100 text-indigo-800";
    case "IN_PROGRESS":
      return "bg-purple-100 text-purple-800";
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-800";
    case "CANCELED":
      return "bg-rose-100 text-rose-800";
    case "NO_SHOW":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return `${date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  })} ${date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getVehicleSizeColor(vehicleSize?: string | null) {
  switch (vehicleSize) {
    case "car":
      return "border-blue-500/70 bg-blue-500/10";
    case "suv":
      return "border-red-500/70 bg-red-500/10";
    case "truck":
      return "border-yellow-500/70 bg-yellow-500/10";
    case "large_suv":
      return "border-emerald-500/70 bg-emerald-500/10";
    case "minivan":
      return "border-purple-500/70 bg-purple-500/10";
    default:
      return "border-slate-700 bg-slate-950";
  }
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toCsv(bookings: BookingListItem[]) {
  const header = [
    "id",
    "status",
    "date",
    "time",
    "location",
    "customer",
    "phone",
    "email",
    "vehicle",
    "service",
    "updated",
  ];
  const rows = bookings.map((booking) => [
    booking.id,
    booking.status,
    booking.requestedDate,
    booking.requestedWindow,
    booking.location.code,
    booking.customer.fullName,
    booking.customer.phone,
    booking.customer.email ?? "",
    `${booking.vehicle.year ?? ""} ${booking.vehicle.make} ${booking.vehicle.model}`.trim(),
    booking.service.name,
    booking.updatedAt,
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function toInputDateTime(dateValue?: string | null) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getAuditChanges(details: unknown) {
  if (!details || typeof details !== "object" || !("changes" in details)) return [];
  const changesRaw = (details as { changes?: unknown }).changes;
  if (!Array.isArray(changesRaw)) return [];
  return changesRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const field = "field" in item ? String((item as { field?: unknown }).field ?? "") : "";
      const from = "from" in item ? (item as { from?: unknown }).from : null;
      const to = "to" in item ? (item as { to?: unknown }).to : null;
      if (!field) return null;
      return {
        field,
        from: from === null || from === undefined ? "empty" : String(from),
        to: to === null || to === undefined ? "empty" : String(to),
      };
    })
    .filter((item): item is { field: string; from: string; to: string } => item !== null);
}

export default function AdminBookingsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [view, setView] = useState<"list" | "calendar">("list");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
  });
  const [fetchState, setFetchState] = useState<"loading" | "ready" | "error">("loading");
  const [fetchError, setFetchError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<BookingStatus>("CONFIRMED");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [slotBlocks, setSlotBlocks] = useState<SlotBlock[]>([]);
  const [metricsMonth, setMetricsMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [lostRevenue, setLostRevenue] = useState<{
    noShowCount: number;
    noShowCents: number;
    totalLostCents: number;
  } | null>(null);

  const [drawerBookingId, setDrawerBookingId] = useState<string | null>(null);
  const [drawerBooking, setDrawerBooking] = useState<BookingListItem | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerForm, setDrawerForm] = useState<DrawerForm | null>(null);
  const [drawerTab, setDrawerTab] = useState<"details" | "activity">("details");

  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const isDev = process.env.NODE_ENV !== "production";

  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const next = { id: Date.now(), type, message };
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === next.id ? null : current));
    }, 2800);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const qView = params.get("view") === "calendar" ? "calendar" : "list";
      const qLocation = params.get("location") ?? "";
      const qStatus = params.get("status") ?? "";
      const qDate = params.get("date") ?? new Date().toISOString().slice(0, 10);
      const qSearch = params.get("search") ?? "";
      const qPage = Number(params.get("page") ?? "1");
      const qPageSize = Number(params.get("pageSize") ?? "50");
      const qCalendarModeParam = params.get("calendarMode");
      const qCalendarMode =
        qCalendarModeParam === "day" ||
        qCalendarModeParam === "week" ||
        qCalendarModeParam === "month"
          ? qCalendarModeParam
          : "week";
      const qCalendarDate = params.get("calendarDate");

      setView((prev) => (prev === qView ? prev : qView));
      setLocation((prev) => (prev === qLocation ? prev : qLocation));
      setStatus((prev) => (prev === qStatus ? prev : qStatus));
      setDate((prev) => (prev === qDate ? prev : qDate));
      setSearch((prev) => (prev === qSearch ? prev : qSearch));
      const safePage = Number.isFinite(qPage) && qPage > 0 ? qPage : 1;
      const safePageSize = Number.isFinite(qPageSize) && qPageSize > 0 ? qPageSize : 50;
      setPage((prev) => (prev === safePage ? prev : safePage));
      setPageSize((prev) => (prev === safePageSize ? prev : safePageSize));
      setCalendarMode((prev) => (prev === qCalendarMode ? prev : qCalendarMode));
      if (qCalendarDate) {
        const nextCalendarDate = new Date(`${qCalendarDate}T00:00:00`);
        if (!Number.isNaN(nextCalendarDate.getTime())) {
          setCalendarCursor((prev) =>
            formatDateKey(prev) === formatDateKey(nextCalendarDate) ? prev : nextCalendarDate
          );
        }
      }
    };

    readFromUrl();
    window.addEventListener("popstate", readFromUrl);
    return () => window.removeEventListener("popstate", readFromUrl);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("admin-bookings-saved-views");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed)) {
        setSavedViews(parsed);
      }
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("admin-bookings-saved-views", JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view === "calendar") params.set("view", view);
    if (location) params.set("location", location);
    if (status) params.set("status", status);
    if (date) params.set("date", date);
    if (search.trim()) params.set("search", search.trim());
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 50) params.set("pageSize", String(pageSize));
    if (view === "calendar") {
      params.set("calendarMode", calendarMode);
      params.set("calendarDate", formatDateKey(calendarCursor));
    }

    const next = params.toString();
    const current = typeof window === "undefined" ? "" : window.location.search.slice(1);
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [
    view,
    location,
    status,
    date,
    search,
    page,
    pageSize,
    calendarMode,
    calendarCursor,
    pathname,
    router,
  ]);

  const loadBookings = useCallback(
    async (manualRefresh = false) => {
      const range = (() => {
        const anchor = new Date(calendarCursor);
        anchor.setHours(0, 0, 0, 0);
        if (calendarMode === "day") return { from: anchor, to: anchor };
        if (calendarMode === "week") {
          const start = startOfWeek(anchor);
          return { from: start, to: addDays(start, 6) };
        }
        return {
          from: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
          to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0),
        };
      })();

      const params = new URLSearchParams();
      if (location) params.set("location", location);
      if (status) params.set("status", status);
      if (view === "calendar") {
        params.set("dateFrom", formatDateKey(range.from));
        params.set("dateTo", formatDateKey(range.to));
      } else if (date) {
        params.set("date", date);
      }
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(view === "calendar" ? 1 : page));
      params.set("pageSize", String(view === "calendar" ? 200 : pageSize));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let statusCode: number | undefined;

      setFetchState("loading");
      setFetchError("");
      if (manualRefresh) setRefreshing(true);

      try {
        const response = await fetch(`/api/bookings?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        statusCode = response.status;

        if (response.status === 401 || response.status === 403) {
          router.push("/admin/login?next=/admin/bookings");
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = data?.error || `Couldn’t load bookings (HTTP ${response.status}).`;
          throw new Error(message);
        }

        const data = await response.json().catch(() => ({}));
        const nextBookings = Array.isArray(data?.bookings) ? data.bookings : [];
        setBookings(nextBookings);
        const nextPagination = data?.pagination;
        setPagination({
          page:
            typeof nextPagination?.page === "number" && nextPagination.page > 0
              ? nextPagination.page
              : 1,
          pageSize:
            typeof nextPagination?.pageSize === "number" && nextPagination.pageSize > 0
              ? nextPagination.pageSize
              : view === "calendar"
                ? 200
                : pageSize,
          total:
            typeof nextPagination?.total === "number" ? nextPagination.total : nextBookings.length,
          totalPages:
            typeof nextPagination?.totalPages === "number" && nextPagination.totalPages > 0
              ? nextPagination.totalPages
              : 1,
        });
        setFetchState("ready");

        if (view === "calendar" && (location === "YXE" || location === "YYC")) {
          const blockParams = new URLSearchParams({
            location,
            dateFrom: formatDateKey(range.from),
            dateTo: formatDateKey(range.to),
          });
          const blockResponse = await fetch(`/api/slot-blocks?${blockParams.toString()}`, {
            credentials: "include",
          });
          if (blockResponse.ok) {
            const blockData = await blockResponse.json().catch(() => ({}));
            setSlotBlocks(Array.isArray(blockData?.blocks) ? blockData.blocks : []);
          } else {
            setSlotBlocks([]);
          }
        } else {
          setSlotBlocks([]);
        }

        if (isDev && nextBookings.length === 0) {
          console.info("[admin/bookings] Empty response. Showing empty state.");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn’t load bookings. Please try again.";
        setFetchError(message);
        setFetchState("error");

        if (isDev) {
          console.error("[admin/bookings] fetch failed", {
            statusCode,
            message,
          });
        }
      } finally {
        clearTimeout(timeoutId);
        if (manualRefresh) setRefreshing(false);
      }
    },
    [
      date,
      isDev,
      location,
      page,
      pageSize,
      router,
      search,
      status,
      view,
      calendarMode,
      calendarCursor,
    ]
  );

  useEffect(() => {
    void loadBookings(false);
  }, [loadBookings]);

  useEffect(() => {
    if (view === "calendar" && !location) {
      setLocation("YXE");
    }
  }, [view, location]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/revenue-loss?month=${encodeURIComponent(metricsMonth)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!data?.totals) return;
        setLostRevenue(data.totals);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [metricsMonth]);

  useEffect(() => {
    setSelectedBookingIds((prev) =>
      prev.filter((bookingId) => bookings.some((booking) => booking.id === bookingId))
    );
  }, [bookings]);

  useEffect(() => {
    if (!drawerBookingId) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerBookingId(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [drawerBookingId]);

  useEffect(() => {
    if (!drawerBookingId) {
      setDrawerBooking(null);
      setDrawerForm(null);
      setDrawerError("");
      setDrawerTab("details");
      return;
    }

    let active = true;
    setDrawerLoading(true);
    setDrawerError("");

    fetch(`/api/bookings/${drawerBookingId}`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.push("/admin/login?next=/admin/bookings");
          return null;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Could not load booking details.");
        }
        return res.json();
      })
      .then((data) => {
        if (!active || !data?.booking) return;
        const booking = data.booking as BookingListItem;
        setDrawerBooking(booking);
        setDrawerForm({
          status: booking.status as BookingStatus,
          adminNotes: booking.adminNotes ?? "",
          dateTime: toInputDateTime(booking.bookingStartDateTime || booking.requestedDate),
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Could not load booking details.";
        setDrawerError(message);
      })
      .finally(() => {
        if (!active) return;
        setDrawerLoading(false);
      });

    return () => {
      active = false;
    };
  }, [drawerBookingId, router]);

  const loading = fetchState === "loading";
  const hasError = fetchState === "error";

  const calendarRange = useMemo(() => {
    const anchor = new Date(calendarCursor);
    anchor.setHours(0, 0, 0, 0);
    if (calendarMode === "day") {
      return { from: anchor, to: anchor };
    }
    if (calendarMode === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return { from: start, to: end };
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: monthStart, to: monthEnd };
  }, [calendarCursor, calendarMode]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(calendarRange.from);
    while (cursor <= calendarRange.to) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [calendarRange]);

  const calendarGroups = useMemo(() => {
    return calendarDays.map((day) =>
      bookings.filter((booking) => {
        const startAt = booking.bookingStartDateTime || booking.requestedDate;
        return sameDay(new Date(startAt), day);
      })
    );
  }, [bookings, calendarDays]);

  const daySlots = useMemo(() => ["09:00", "11:00", "13:30", "15:30"], []);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (location)
      chips.push({
        key: "location",
        label: `Location: ${location}`,
        clear: () => {
          setLocation("");
          setPage(1);
        },
      });
    if (status)
      chips.push({
        key: "status",
        label: `Status: ${status.replaceAll("_", " ")}`,
        clear: () => {
          setStatus("");
          setPage(1);
        },
      });
    if (date)
      chips.push({
        key: "date",
        label: `Date: ${date}`,
        clear: () => {
          setDate("");
          setPage(1);
        },
      });
    if (search.trim())
      chips.push({
        key: "search",
        label: `Search: ${search.trim()}`,
        clear: () => {
          setSearch("");
          setPage(1);
        },
      });
    return chips;
  }, [date, location, search, status]);

  const clearFilters = () => {
    setLocation("");
    setStatus("");
    setDate(new Date().toISOString().slice(0, 10));
    setSearch("");
    setPage(1);
    setSelectedBookingIds([]);
  };

  const applySavedView = (savedView: SavedView) => {
    setView("list");
    setLocation(savedView.location);
    setStatus(savedView.status);
    setDate(savedView.date);
    setSearch(savedView.search);
    setPage(1);
  };

  const saveCurrentView = () => {
    const name = window.prompt("Name this saved view:");
    if (!name || !name.trim()) return;
    const next: SavedView = {
      id: crypto.randomUUID(),
      name: name.trim(),
      location,
      status,
      date,
      search: search.trim(),
    };
    setSavedViews((prev) => [next, ...prev].slice(0, 12));
    showToast("success", "View saved");
  };

  const removeSavedView = (id: string) => {
    setSavedViews((prev) => prev.filter((item) => item.id !== id));
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (status) params.set("status", status);
    if (date) params.set("date", date);
    if (search.trim()) params.set("search", search.trim());

    const exportPageSize = 200;
    let exportPage = 1;
    let allBookings: BookingListItem[] = [];

    while (true) {
      params.set("page", String(exportPage));
      params.set("pageSize", String(exportPageSize));
      const response = await fetch(`/api/bookings?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        showToast("error", "CSV export failed");
        return;
      }
      const data = await response.json().catch(() => ({}));
      const pageBookings = Array.isArray(data?.bookings)
        ? (data.bookings as BookingListItem[])
        : [];
      allBookings = [...allBookings, ...pageBookings];
      const totalPages =
        typeof data?.pagination?.totalPages === "number" ? data.pagination.totalPages : 1;
      if (exportPage >= totalPages || pageBookings.length === 0) break;
      exportPage += 1;
    }

    const csv = toCsv(allBookings);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filtersSlug = [
      location ? `loc-${location}` : "",
      status ? `status-${status.toLowerCase()}` : "",
      date ? `date-${date}` : "",
      search.trim() ? "search" : "",
    ]
      .filter(Boolean)
      .join("_");

    link.href = url;
    link.download = `bookings_${today}_${filtersSlug || "filters"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteBooking = async (id: string) => {
    const confirmed = window.confirm("Delete this booking? This cannot be undone.");
    if (!confirmed) return;
    setDeleteError("");
    setDeletingId(id);
    const response = await fetch(`/api/bookings/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      setDeleteError("Failed to delete booking. Please try again.");
      setDeletingId(null);
      showToast("error", "Delete failed");
      return;
    }
    setBookings((prev) => prev.filter((item) => item.id !== id));
    setSelectedBookingIds((prev) => prev.filter((bookingId) => bookingId !== id));
    setDeletingId(null);
    showToast("success", "Booking deleted");
  };

  const toggleSelectBooking = (id: string) => {
    setSelectedBookingIds((prev) =>
      prev.includes(id) ? prev.filter((bookingId) => bookingId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allVisibleIds = bookings.map((booking) => booking.id);
    const allSelected =
      allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedBookingIds.includes(id));
    setSelectedBookingIds(allSelected ? [] : allVisibleIds);
  };

  const applyBulkStatus = async () => {
    if (selectedBookingIds.length === 0) return;
    setBulkUpdating(true);

    const response = await fetch("/api/bookings/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        bookingIds: selectedBookingIds,
        status: bulkStatus,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      setBulkUpdating(false);
      router.push("/admin/login?next=/admin/bookings");
      return;
    }

    if (!response.ok) {
      showToast("error", "Bulk update failed");
      setBulkUpdating(false);
      return;
    }

    setBookings((prev) =>
      prev.map((booking) =>
        selectedBookingIds.includes(booking.id) ? { ...booking, status: bulkStatus } : booking
      )
    );
    setSelectedBookingIds([]);
    setBulkUpdating(false);
    showToast("success", "Bulk status updated");
  };

  const blockSlotLine = async (startAtIso: string, slotLine: number) => {
    if (location !== "YXE" && location !== "YYC") {
      showToast("error", "Pick YXE or YYC to block slots");
      return;
    }
    const reason = window.prompt("Optional reason for blocking this slot line:") || undefined;
    const response = await fetch("/api/slot-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        locationCode: location,
        startAt: startAtIso,
        slotLine,
        reason,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not block slot");
      return;
    }
    await loadBookings(true);
    showToast("success", "Slot line blocked");
  };

  const unblockSlotLine = async (blockId: string) => {
    const response = await fetch(`/api/slot-blocks?id=${encodeURIComponent(blockId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not unblock slot");
      return;
    }
    await loadBookings(true);
    showToast("success", "Slot line unblocked");
  };

  const blockLineForWholeDay = async (slotLine: number) => {
    if (location !== "YXE" && location !== "YYC") {
      showToast("error", "Pick YXE or YYC first");
      return;
    }
    const reason =
      window.prompt(`Reason for blocking line #${slotLine} for the whole day:`) || undefined;
    const results = await Promise.all(
      daySlots.map(async (time) => {
        const [hours, minutes] = time.split(":").map(Number);
        const startAt = new Date(calendarCursor);
        startAt.setHours(hours, minutes, 0, 0);
        const response = await fetch("/api/slot-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            locationCode: location,
            startAt: startAt.toISOString(),
            slotLine,
            reason,
          }),
        });
        return response.ok;
      })
    );
    if (results.every(Boolean)) {
      await loadBookings(true);
      showToast("success", `Blocked line #${slotLine} for whole day`);
      return;
    }
    showToast("error", "Some line blocks failed");
  };

  const blockWholeDay = async () => {
    if (location !== "YXE" && location !== "YYC") {
      showToast("error", "Pick YXE or YYC first");
      return;
    }
    const reason = window.prompt("Reason for blocking the whole day:") || undefined;
    const jobs: Promise<boolean>[] = [];
    for (const time of daySlots) {
      const [hours, minutes] = time.split(":").map(Number);
      const startAt = new Date(calendarCursor);
      startAt.setHours(hours, minutes, 0, 0);
      for (let slotLine = 1; slotLine <= 4; slotLine += 1) {
        jobs.push(
          fetch("/api/slot-blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              locationCode: location,
              startAt: startAt.toISOString(),
              slotLine,
              reason,
            }),
          }).then((res) => res.ok)
        );
      }
    }
    const results = await Promise.all(jobs);
    if (results.every(Boolean)) {
      await loadBookings(true);
      showToast("success", "Blocked whole day");
      return;
    }
    showToast("error", "Some day blocks failed");
  };

  const unblockLineForWholeDay = async (slotLine: number) => {
    const dayBlocks = slotBlocks.filter((block) => {
      const blockStart = new Date(block.startAt);
      return sameDay(blockStart, calendarCursor) && block.slotLine === slotLine;
    });
    if (!dayBlocks.length) return;
    const results = await Promise.all(
      dayBlocks.map((block) =>
        fetch(`/api/slot-blocks?id=${encodeURIComponent(block.id)}`, {
          method: "DELETE",
          credentials: "include",
        }).then((res) => res.ok)
      )
    );
    if (results.every(Boolean)) {
      await loadBookings(true);
      showToast("success", `Unblocked line #${slotLine} for whole day`);
      return;
    }
    showToast("error", "Some unblocks failed");
  };

  const unblockWholeDay = async () => {
    const dayBlocks = slotBlocks.filter((block) =>
      sameDay(new Date(block.startAt), calendarCursor)
    );
    if (!dayBlocks.length) return;
    const results = await Promise.all(
      dayBlocks.map((block) =>
        fetch(`/api/slot-blocks?id=${encodeURIComponent(block.id)}`, {
          method: "DELETE",
          credentials: "include",
        }).then((res) => res.ok)
      )
    );
    if (results.every(Boolean)) {
      await loadBookings(true);
      showToast("success", "Unblocked whole day");
      return;
    }
    showToast("error", "Some day unblocks failed");
  };

  const blockClientFromDrawer = async () => {
    if (!drawerBooking) return;
    if (drawerBooking.blockedCustomer?.isActive) {
      showToast("error", "Client is already blocked");
      return;
    }
    const reason = window.prompt("Reason for blocking this client (admin only):") || "";
    const clientFacingNote =
      window.prompt("Client-facing note shown when they try booking again:") || "";
    const response = await fetch("/api/blocked-customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fullName: drawerBooking.customer.fullName,
        phone: drawerBooking.customer.phone,
        email: drawerBooking.customer.email || "",
        reason,
        clientFacingNote,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not block client");
      return;
    }
    await loadBookings(true);
    showToast("success", "Client blocked");
  };

  const unblockClientFromDrawer = async () => {
    const blockedId = drawerBooking?.blockedCustomer?.id;
    if (!blockedId) return;
    const response = await fetch(`/api/blocked-customers?id=${encodeURIComponent(blockedId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not unblock client");
      return;
    }
    await loadBookings(true);
    showToast("success", "Client unblocked");
  };

  const markPotentialMaintenanceFromDrawer = async () => {
    if (!drawerBooking) return;
    if (drawerBooking.blockedCustomer?.isPotentialMaintenance) {
      showToast("error", "Client is already marked as potential maintenance");
      return;
    }
    const maintenanceReason =
      window.prompt("Optional note for why this client is a potential maintenance client:") || "";
    const response = await fetch("/api/blocked-customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        fullName: drawerBooking.customer.fullName,
        phone: drawerBooking.customer.phone,
        email: drawerBooking.customer.email || "",
        isPotentialMaintenance: true,
        maintenanceReason,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not mark maintenance client");
      return;
    }
    const blockedCustomer = data?.blockedCustomer || null;
    setDrawerBooking((prev) => (prev ? { ...prev, blockedCustomer } : prev));
    setBookings((prev) =>
      prev.map((item) => (item.id === drawerBooking.id ? { ...item, blockedCustomer } : item))
    );
    await loadBookings(true);
    showToast("success", "Client marked as potential maintenance");
  };

  const clearPotentialMaintenanceFromDrawer = async () => {
    const blockedId = drawerBooking?.blockedCustomer?.id;
    if (!blockedId) return;
    const response = await fetch(
      `/api/blocked-customers?id=${encodeURIComponent(blockedId)}&type=maintenance`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast("error", data?.error || "Could not remove maintenance flag");
      return;
    }
    const nextBlockedCustomer = drawerBooking?.blockedCustomer
      ? { ...drawerBooking.blockedCustomer, isPotentialMaintenance: false, maintenanceReason: null }
      : null;
    setDrawerBooking((prev) => (prev ? { ...prev, blockedCustomer: nextBlockedCustomer } : prev));
    setBookings((prev) =>
      prev.map((item) =>
        item.id === drawerBooking?.id ? { ...item, blockedCustomer: nextBlockedCustomer } : item
      )
    );
    await loadBookings(true);
    showToast("success", "Maintenance flag removed");
  };

  const updateStatusQuick = async (bookingItem: BookingListItem, nextStatus: BookingStatus) => {
    const id = bookingItem.id;
    let clientFacingNote: string | undefined;
    if (nextStatus === "NO_SHOW") {
      const note = window.prompt(
        "Client-facing ban note (shown when this client tries to book again):"
      );
      if (!note || !note.trim()) {
        showToast("error", "No-show requires a client-facing ban note");
        return;
      }
      clientFacingNote = note.trim();
    }

    setStatusUpdatingId(id);
    const response = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!response.ok) {
      showToast("error", "Could not update status");
      setStatusUpdatingId(null);
      return;
    }

    const data = await response.json().catch(() => null);
    const updated = data?.booking;

    setBookings((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: nextStatus,
              updatedAt: updated?.updatedAt ?? item.updatedAt,
            }
          : item
      )
    );

    if (drawerBooking?.id === id) {
      setDrawerBooking((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setDrawerForm((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    }

    setStatusUpdatingId(null);

    if (nextStatus === "NO_SHOW" && clientFacingNote) {
      await fetch("/api/blocked-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: bookingItem.customer.fullName,
          phone: bookingItem.customer.phone,
          email: bookingItem.customer.email || "",
          reason: "Automatic block after no-show",
          clientFacingNote,
        }),
      });
    }

    showToast("success", "Booking updated");
  };

  const saveDrawer = async () => {
    if (!drawerBooking || !drawerForm) return;
    let noShowClientNote: string | undefined;

    const payload: Record<string, string> = {};

    if (drawerForm.status !== drawerBooking.status) {
      if (drawerForm.status === "NO_SHOW") {
        const note = window.prompt(
          "Client-facing ban note (shown when this client tries to book again):"
        );
        if (!note || !note.trim()) {
          setDrawerError("No-show requires a client-facing ban note.");
          return;
        }
        noShowClientNote = note.trim();
      }
      payload.status = drawerForm.status;
    }
    if (drawerForm.adminNotes !== (drawerBooking.adminNotes ?? "")) {
      payload.adminNotes = drawerForm.adminNotes;
    }
    if (drawerForm.dateTime) {
      const nextDate = new Date(drawerForm.dateTime);
      if (Number.isNaN(nextDate.getTime())) {
        setDrawerError("Invalid date/time.");
        return;
      }
      payload.bookingStartDateTime = nextDate.toISOString();
      payload.requestedDate = nextDate.toISOString();
      payload.requestedWindow = formatTimeLabel(nextDate);
    }

    if (Object.keys(payload).length === 0) {
      setDrawerBookingId(null);
      return;
    }

    setDrawerSaving(true);
    setDrawerError("");

    const response = await fetch(`/api/bookings/${drawerBooking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data?.error || "Could not save updates.";
      setDrawerError(message);
      setDrawerSaving(false);
      showToast("error", "Update failed");
      return;
    }

    const data = await response.json().catch(() => null);
    const updatedBooking = (data?.booking ?? null) as BookingListItem | null;

    if (updatedBooking) {
      setDrawerBooking(updatedBooking);
      setDrawerForm({
        status: updatedBooking.status as BookingStatus,
        adminNotes: updatedBooking.adminNotes ?? "",
        dateTime: toInputDateTime(
          updatedBooking.bookingStartDateTime || updatedBooking.requestedDate
        ),
      });

      setBookings((prev) =>
        prev.map((item) => (item.id === updatedBooking.id ? { ...item, ...updatedBooking } : item))
      );
    }

    if (drawerForm.status === "NO_SHOW" && noShowClientNote) {
      await fetch("/api/blocked-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: drawerBooking.customer.fullName,
          phone: drawerBooking.customer.phone,
          email: drawerBooking.customer.email || "",
          reason: "Automatic block after no-show",
          clientFacingNote: noShowClientNote,
        }),
      });
    }

    setDrawerSaving(false);
    showToast("success", "Booking updated");
  };

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 xl:grid-cols-[auto_auto_auto_1fr_auto_auto]">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.15em] text-slate-500">Location</p>
            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1">
              {[
                { label: "All", value: "" },
                { label: "YXE", value: "YXE" },
                { label: "YYC", value: "YYC" },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => {
                    setLocation(option.value);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    location === option.value
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="mt-2 w-full min-w-[170px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setPage(1);
              }}
              className="mt-2 w-full min-w-[170px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
            Search
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, email, phone, vehicle"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <button
            onClick={clearFilters}
            className="mt-6 rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Clear Filters
          </button>

          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={() => setView((prev) => (prev === "list" ? "calendar" : "list"))}
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100"
            >
              {view === "list" ? "Calendar view" : "List view"}
            </button>
            {view === "list" && (
              <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                <span className="sr-only">Page size</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100"
                  aria-label="Page size"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}/page
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              onClick={() => void loadBookings(true)}
              disabled={loading || refreshing}
              className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={() => void exportCsv()}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Saved views</p>
          <button
            onClick={() =>
              applySavedView({
                id: "preset-today-yxe-confirmed",
                name: "Today YXE Confirmed",
                location: "YXE",
                status: "CONFIRMED",
                date: today,
                search: "",
              })
            }
            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
          >
            Today YXE Confirmed
          </button>
          <button
            onClick={() =>
              applySavedView({
                id: "preset-today-all",
                name: "Today All",
                location: "",
                status: "",
                date: today,
                search: "",
              })
            }
            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
          >
            Today All
          </button>
          <button
            onClick={() =>
              applySavedView({
                id: "preset-yxe-open",
                name: "YXE Open",
                location: "YXE",
                status: "IN_PROGRESS",
                date: "",
                search: "",
              })
            }
            className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
          >
            YXE In Progress
          </button>
          <button
            onClick={saveCurrentView}
            className="rounded-full border border-slate-700 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-900"
          >
            Save current
          </button>
          {savedViews.map((savedView) => (
            <span
              key={savedView.id}
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950"
            >
              <button
                onClick={() => applySavedView(savedView)}
                className="px-3 py-1 text-xs text-slate-300"
              >
                {savedView.name}
              </button>
              <button
                onClick={() => removeSavedView(savedView.id)}
                className="border-l border-slate-700 px-2 py-1 text-xs text-slate-500"
                aria-label={`Remove saved view ${savedView.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {activeChips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.clear}
                className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
                aria-label={`Remove ${chip.label} filter`}
              >
                {chip.label} ×
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Loss tracking</p>
          <input
            type="month"
            value={metricsMonth}
            onChange={(event) => setMetricsMonth(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          {lostRevenue && (
            <>
              <p className="text-sm text-slate-300">
                No-shows:{" "}
                <span className="font-semibold text-orange-300">{lostRevenue.noShowCount}</span>
              </p>
              <p className="text-sm text-slate-300">
                No-show revenue loss:{" "}
                <span className="font-semibold text-amber-300">
                  {formatCurrency(lostRevenue.totalLostCents)}
                </span>
              </p>
            </>
          )}
        </div>
      </section>

      {selectedBookingIds.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-100">
            {selectedBookingIds.length} selected
          </p>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as BookingStatus)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            aria-label="Bulk status"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button
            onClick={() => void applyBulkStatus()}
            disabled={bulkUpdating}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {bulkUpdating ? "Updating..." : "Apply"}
          </button>
          <button
            onClick={() => setSelectedBookingIds([])}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Clear selection
          </button>
        </section>
      )}

      {deleteError && (
        <p className="rounded-xl border border-rose-900/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {deleteError}
        </p>
      )}

      {hasError && !loading && (
        <section className="rounded-2xl border border-rose-900/40 bg-rose-950/20 p-5">
          <p className="text-sm font-semibold text-rose-300">Couldn’t load bookings</p>
          <p className="mt-1 text-sm text-rose-200/80">{fetchError || "Please try again."}</p>
          <button
            onClick={() => void loadBookings(true)}
            className="mt-4 rounded-xl border border-rose-700 px-4 py-2 text-sm font-semibold text-rose-200"
          >
            Retry
          </button>
        </section>
      )}

      {loading && view === "list" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-slate-200" />
            <span>Loading bookings...</span>
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-800" />
            ))}
          </div>
        </section>
      )}

      {loading && view === "calendar" && (
        <section className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
            />
          ))}
        </section>
      )}

      {!loading && !hasError && view === "list" && bookings.length === 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm font-semibold text-slate-200">No bookings match your filters.</p>
          <p className="mt-1 text-sm text-slate-400">Try removing one or more filters.</p>
          <button
            onClick={clearFilters}
            className="mt-4 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Reset filters
          </button>
        </section>
      )}

      {!loading && !hasError && bookings.length > 0 && view === "list" && (
        <>
          <section className="hidden overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-xs uppercase tracking-[0.15em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all visible bookings"
                      checked={
                        bookings.length > 0 &&
                        bookings.every((booking) => selectedBookingIds.includes(booking.id))
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    tabIndex={0}
                    onClick={() => setDrawerBookingId(booking.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDrawerBookingId(booking.id);
                      }
                    }}
                    className="cursor-pointer border-t border-slate-800 text-slate-200 transition hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-300"
                    aria-label={`Open booking ${booking.id}`}
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedBookingIds.includes(booking.id)}
                        onChange={() => toggleSelectBooking(booking.id)}
                        aria-label={`Select booking ${booking.id}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p>{formatDate(booking.requestedDate)}</p>
                      <p className="text-xs text-slate-400">{booking.requestedWindow}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {booking.customer.fullName}
                        {booking.blockedCustomer?.isActive && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-rose-700 bg-rose-900/40 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                            ⛔ Blocked
                          </span>
                        )}
                        {booking.blockedCustomer?.isPotentialMaintenance && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-amber-700 bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                            Potential maintenance
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">{booking.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">{booking.service.name}</td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <select
                        aria-label="Update booking status"
                        value={booking.status}
                        disabled={statusUpdatingId === booking.id}
                        onChange={(event) =>
                          void updateStatusQuick(booking, event.target.value as BookingStatus)
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(
                          booking.status
                        )}`}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">{booking.location.code}</td>
                    <td className="px-4 py-3">{formatDateTime(booking.updatedAt)}</td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDrawerBookingId(booking.id)}
                          className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => void deleteBooking(booking.id)}
                          disabled={deletingId === booking.id}
                          className="rounded-lg border border-rose-800 px-3 py-1 text-xs font-semibold text-rose-300 disabled:opacity-60"
                        >
                          {deletingId === booking.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="grid gap-3 md:hidden">
            {bookings.map((booking) => (
              <article
                key={booking.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
              >
                <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={selectedBookingIds.includes(booking.id)}
                    onChange={() => toggleSelectBooking(booking.id)}
                    aria-label={`Select booking ${booking.id}`}
                  />
                  Select
                </label>
                <button
                  onClick={() => setDrawerBookingId(booking.id)}
                  className="w-full text-left"
                  aria-label={`Open booking ${booking.id}`}
                >
                  <p className="text-sm text-slate-400">
                    {formatDate(booking.requestedDate)} · {booking.requestedWindow}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{booking.customer.fullName}</p>
                  {booking.blockedCustomer?.isActive && (
                    <p className="text-xs font-semibold text-rose-300">⛔ Blocked client</p>
                  )}
                  {booking.blockedCustomer?.isPotentialMaintenance && (
                    <p className="text-xs font-semibold text-amber-300">
                      Potential maintenance client
                    </p>
                  )}
                  <p className="text-sm text-slate-400">
                    {booking.service.name} · {booking.location.code}
                  </p>
                  <p className="text-sm text-slate-500">
                    Updated {formatDateTime(booking.updatedAt)}
                  </p>
                </button>

                <div className="mt-3 grid gap-2">
                  <select
                    aria-label="Update booking status"
                    value={booking.status}
                    disabled={statusUpdatingId === booking.id}
                    onChange={(event) =>
                      void updateStatusQuick(booking, event.target.value as BookingStatus)
                    }
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${statusBadge(booking.status)}`}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void deleteBooking(booking.id)}
                    disabled={deletingId === booking.id}
                    className="rounded-xl border border-rose-800 px-3 py-2 text-sm font-semibold text-rose-300 disabled:opacity-60"
                  >
                    {deletingId === booking.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-300">
              Showing{" "}
              <span className="font-semibold text-slate-100">
                {(pagination.page - 1) * pagination.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-100">
                {Math.min(pagination.page * pagination.pageSize, pagination.total)}
              </span>{" "}
              of <span className="font-semibold text-slate-100">{pagination.total}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={pagination.page <= 1}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-sm text-slate-300">
                Page {pagination.page} / {pagination.totalPages}
              </p>
              <button
                onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}

      {!loading && !hasError && view === "calendar" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Calendar</p>
              <p className="text-lg font-semibold">
                {calendarRange.from.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                {" — "}
                {calendarRange.to.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1">
                {(["day", "week", "month"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCalendarMode(mode)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase ${
                      calendarMode === mode
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  setCalendarCursor((current) =>
                    addDays(
                      current,
                      calendarMode === "day" ? -1 : calendarMode === "week" ? -7 : -30
                    )
                  )
                }
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100"
              >
                Prev
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  setCalendarCursor(now);
                }}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100"
              >
                Today
              </button>
              <button
                onClick={() =>
                  setCalendarCursor((current) =>
                    addDays(current, calendarMode === "day" ? 1 : calendarMode === "week" ? 7 : 30)
                  )
                }
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100"
              >
                Next
              </button>
            </div>
          </div>

          {calendarMode === "day" && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-300">
                  {calendarCursor.toLocaleDateString("en-CA", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void blockWholeDay()}
                    className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-200"
                  >
                    Block whole day
                  </button>
                  <button
                    onClick={() => void unblockWholeDay()}
                    className="rounded-lg border border-emerald-700 px-2 py-1 text-xs text-emerald-200"
                  >
                    Unblock whole day
                  </button>
                  {[1, 2, 3, 4].map((line) => (
                    <span key={line} className="inline-flex items-center gap-1">
                      <button
                        onClick={() => void blockLineForWholeDay(line)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200"
                      >
                        Block line #{line}
                      </button>
                      <button
                        onClick={() => void unblockLineForWholeDay(line)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400"
                      >
                        Unblock
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                {daySlots.map((time) => {
                  const dayStart = new Date(calendarCursor);
                  const [hours, minutes] = time.split(":").map(Number);
                  dayStart.setHours(hours, minutes, 0, 0);
                  const slotKey = `${location}:${dayStart.toISOString().slice(0, 16)}`;
                  const slotBookings = bookings
                    .filter((booking) => {
                      const startAt = new Date(
                        booking.bookingStartDateTime || booking.requestedDate
                      );
                      return (
                        sameDay(startAt, calendarCursor) &&
                        startAt.getHours() === hours &&
                        startAt.getMinutes() === minutes
                      );
                    })
                    .sort((a, b) => (a.slotSequence ?? 999) - (b.slotSequence ?? 999));
                  const blockByLine = new Map(
                    slotBlocks
                      .filter((block) => location && block.slotKey === slotKey)
                      .map((block) => [block.slotLine, block] as const)
                  );

                  return (
                    <div key={time} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <p className="mb-2 text-sm font-semibold text-slate-100">
                        {dayStart.toLocaleTimeString("en-CA", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <div className="grid gap-2 md:grid-cols-4">
                        {Array.from({ length: 4 }, (_, index) => {
                          const line = index + 1;
                          const booking = slotBookings.find((item) => item.slotSequence === line);
                          const block = blockByLine.get(line);
                          if (booking) {
                            return (
                              <button
                                key={`booked-${booking.id}`}
                                onClick={() => setDrawerBookingId(booking.id)}
                                className={`rounded-lg border px-3 py-2 text-left text-xs text-slate-100 ${getVehicleSizeColor(
                                  booking.vehicle.size
                                )}`}
                              >
                                <p className="font-semibold">
                                  #{line} {booking.customer.fullName}
                                  {booking.blockedCustomer?.isActive && (
                                    <span className="ml-1 text-rose-300" title="Blocked client">
                                      ⛔
                                    </span>
                                  )}
                                  {booking.status === "IN_PROGRESS" && (
                                    <span className="ml-1 text-yellow-300" title="In progress">
                                      ★
                                    </span>
                                  )}
                                </p>
                                <p className="text-slate-300">{booking.service.name}</p>
                              </button>
                            );
                          }

                          if (block) {
                            return (
                              <div
                                key={`blocked-${line}`}
                                className="rounded-lg border border-rose-600/60 bg-rose-900/20 px-3 py-2 text-xs"
                              >
                                <p className="font-semibold text-rose-200">#{line} Blocked</p>
                                {block.reason && <p className="text-rose-100/80">{block.reason}</p>}
                                <button
                                  onClick={() => void unblockSlotLine(block.id)}
                                  className="mt-2 rounded border border-rose-500 px-2 py-1 text-xs text-rose-100"
                                >
                                  Unblock
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`open-${line}`}
                              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400"
                            >
                              <p>#{line} Open</p>
                              <button
                                disabled={location !== "YXE" && location !== "YYC"}
                                onClick={() => void blockSlotLine(dayStart.toISOString(), line)}
                                className="mt-2 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
                              >
                                Block line
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calendarMode === "week" && (
            <div className="grid gap-3 md:grid-cols-7">
              {calendarDays.map((day, index) => (
                <div
                  key={day.toISOString()}
                  className="flex min-h-[180px] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-3"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {day.toLocaleDateString("en-CA", { weekday: "short" })}
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {day.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </p>
                  <div className="mt-3 flex flex-1 flex-col gap-2">
                    {calendarGroups[index]?.length ? (
                      calendarGroups[index].map((booking) => (
                        <button
                          key={booking.id}
                          onClick={() => setDrawerBookingId(booking.id)}
                          className={`rounded-xl border px-3 py-2 text-left text-xs text-slate-100 transition hover:border-slate-500 ${getVehicleSizeColor(
                            booking.vehicle.size
                          )}`}
                        >
                          <p className="font-semibold">
                            {booking.customer.fullName}
                            {booking.blockedCustomer?.isActive && (
                              <span className="ml-1 text-rose-300" title="Blocked client">
                                ⛔
                              </span>
                            )}
                            {booking.status === "IN_PROGRESS" && (
                              <span className="ml-1 text-yellow-300" title="In progress">
                                ★
                              </span>
                            )}
                          </p>
                          <p className="text-slate-300">
                            {booking.requestedWindow} · {booking.service.name}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600">No bookings</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {calendarMode === "month" && (
            <div className="grid gap-3 md:grid-cols-7">
              {calendarDays.map((day, index) => (
                <div
                  key={day.toISOString()}
                  className="flex min-h-[140px] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-3"
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {day.toLocaleDateString("en-CA", { day: "numeric" })}
                  </p>
                  <div className="mt-2 flex flex-1 flex-col gap-2">
                    {calendarGroups[index]?.slice(0, 3).map((booking) => (
                      <button
                        key={booking.id}
                        onClick={() => setDrawerBookingId(booking.id)}
                        className={`rounded-xl border px-2 py-1 text-left text-[11px] text-slate-100 ${getVehicleSizeColor(
                          booking.vehicle.size
                        )}`}
                      >
                        <p className="truncate font-semibold">
                          {booking.customer.fullName}
                          {booking.blockedCustomer?.isActive && (
                            <span className="ml-1 text-rose-300" title="Blocked client">
                              ⛔
                            </span>
                          )}
                          {booking.status === "IN_PROGRESS" && (
                            <span className="ml-1 text-yellow-300" title="In progress">
                              ★
                            </span>
                          )}
                        </p>
                        <p className="truncate text-slate-300">{booking.requestedWindow}</p>
                      </button>
                    ))}
                    {(calendarGroups[index]?.length ?? 0) > 3 && (
                      <p className="text-[11px] text-slate-400">
                        +{(calendarGroups[index]?.length ?? 0) - 3} more
                      </p>
                    )}
                    {(calendarGroups[index]?.length ?? 0) === 0 && (
                      <p className="text-xs text-slate-600">No bookings</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {drawerBookingId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
          <button
            className="h-full flex-1"
            aria-label="Close booking drawer"
            onClick={() => setDrawerBookingId(null)}
          />
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-slate-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Booking details</h2>
              <button
                onClick={() => setDrawerBookingId(null)}
                className="rounded-xl border border-slate-700 px-3 py-1 text-xs"
                aria-label="Close drawer"
              >
                Close
              </button>
            </div>

            {drawerLoading && (
              <div className="grid gap-3">
                <div className="h-6 w-1/2 animate-pulse rounded bg-slate-800" />
                <div className="h-20 animate-pulse rounded bg-slate-800" />
                <div className="h-20 animate-pulse rounded bg-slate-800" />
              </div>
            )}

            {!drawerLoading && drawerError && (
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-200">
                {drawerError}
              </div>
            )}

            {!drawerLoading && drawerBooking && drawerForm && (
              <div className="space-y-5">
                <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1">
                  <button
                    onClick={() => setDrawerTab("details")}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      drawerTab === "details"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setDrawerTab("activity")}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      drawerTab === "activity"
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    Activity
                  </button>
                </div>

                {drawerTab === "activity" ? (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-xs uppercase tracking-[0.15em] text-slate-500">
                      Booking activity
                    </p>
                    <div className="mt-3 space-y-3">
                      {(drawerBooking.audits ?? []).length === 0 && (
                        <p className="text-sm text-slate-400">No activity yet.</p>
                      )}
                      {(drawerBooking.audits ?? []).map((audit) => (
                        <article
                          key={audit.id}
                          className="rounded-xl border border-slate-800 bg-slate-950 p-3"
                        >
                          <p className="text-sm font-semibold text-slate-100">
                            {audit.action.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {audit.actor || "system"} · {formatDateTime(audit.createdAt)}
                          </p>
                          {getAuditChanges(audit.details).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {getAuditChanges(audit.details).map((change) => (
                                <p
                                  key={`${audit.id}-${change.field}`}
                                  className="text-xs text-slate-300"
                                >
                                  <span className="text-slate-500">{change.field}:</span>{" "}
                                  {change.from} → {change.to}
                                </p>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Customer</p>
                      <p className="mt-2 font-semibold">{drawerBooking.customer.fullName}</p>
                      <p className="text-sm text-slate-400">{drawerBooking.customer.phone}</p>
                      {drawerBooking.customer.email && (
                        <p className="text-sm text-slate-400">{drawerBooking.customer.email}</p>
                      )}
                      {drawerBooking.blockedCustomer?.isActive ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-semibold text-rose-300">
                            ⛔ This client is blocked
                          </p>
                          {drawerBooking.blockedCustomer.clientFacingNote && (
                            <p className="text-xs text-slate-400">
                              Client note: {drawerBooking.blockedCustomer.clientFacingNote}
                            </p>
                          )}
                          {drawerBooking.blockedCustomer.reason && (
                            <p className="text-xs text-slate-500">
                              Admin reason: {drawerBooking.blockedCustomer.reason}
                            </p>
                          )}
                          <button
                            onClick={() => void unblockClientFromDrawer()}
                            className="rounded-xl border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200"
                          >
                            Unblock client
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => void blockClientFromDrawer()}
                          className="mt-3 rounded-xl border border-rose-700 px-3 py-2 text-xs font-semibold text-rose-200"
                        >
                          Block client
                        </button>
                      )}
                      {drawerBooking.blockedCustomer?.isPotentialMaintenance ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
                          <p className="text-xs font-semibold text-amber-200">
                            Potential maintenance client
                          </p>
                          {drawerBooking.blockedCustomer.maintenanceReason && (
                            <p className="text-xs text-slate-300">
                              Note: {drawerBooking.blockedCustomer.maintenanceReason}
                            </p>
                          )}
                          <button
                            onClick={() => void clearPotentialMaintenanceFromDrawer()}
                            className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200"
                          >
                            Remove maintenance mark
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => void markPotentialMaintenanceFromDrawer()}
                          className="mt-3 rounded-xl border border-amber-700 px-3 py-2 text-xs font-semibold text-amber-200"
                        >
                          Mark as potential maintenance
                        </button>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="grid gap-3">
                        <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                          Status
                          <select
                            value={drawerForm.status}
                            onChange={(event) =>
                              setDrawerForm((prev) =>
                                prev
                                  ? { ...prev, status: event.target.value as BookingStatus }
                                  : prev
                              )
                            }
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                          Date & Time
                          <input
                            type="datetime-local"
                            value={drawerForm.dateTime}
                            onChange={(event) =>
                              setDrawerForm((prev) =>
                                prev ? { ...prev, dateTime: event.target.value } : prev
                              )
                            }
                            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="text-xs uppercase tracking-[0.15em] text-slate-500">
                          Notes
                          <textarea
                            value={drawerForm.adminNotes}
                            onChange={(event) =>
                              setDrawerForm((prev) =>
                                prev ? { ...prev, adminNotes: event.target.value } : prev
                              )
                            }
                            className="mt-2 min-h-[110px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            placeholder="Internal notes"
                          />
                        </label>

                        {drawerError && <p className="text-sm text-rose-300">{drawerError}</p>}

                        <button
                          onClick={saveDrawer}
                          disabled={drawerSaving}
                          className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        >
                          {drawerSaving ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Booking</p>
                      <p className="mt-2">
                        <span className="text-slate-500">Service:</span>{" "}
                        {drawerBooking.service.name}
                      </p>
                      <p>
                        <span className="text-slate-500">Location:</span>{" "}
                        {drawerBooking.location.name}
                      </p>
                      <p>
                        <span className="text-slate-500">Vehicle:</span>{" "}
                        {drawerBooking.vehicle.year ?? ""} {drawerBooking.vehicle.make}{" "}
                        {drawerBooking.vehicle.model}
                      </p>
                      {drawerBooking.vehicle.size && (
                        <p>
                          <span className="text-slate-500">Size:</span>{" "}
                          {drawerBooking.vehicle.size.replaceAll("_", " ")}
                        </p>
                      )}
                      <p>
                        <span className="text-slate-500">Requested:</span>{" "}
                        {formatDate(drawerBooking.requestedDate)} · {drawerBooking.requestedWindow}
                      </p>
                      {drawerBooking.customerNotes && (
                        <p className="mt-2">
                          <span className="text-slate-500">Customer notes:</span>{" "}
                          {drawerBooking.customerNotes}
                        </p>
                      )}
                    </section>

                    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.15em] text-slate-500">
                        Booking history
                      </p>
                      <div className="mt-2 grid gap-1">
                        <p>
                          <span className="text-slate-500">Total visits:</span>{" "}
                          {drawerBooking.bookingHistory?.totalVisits ?? 0}
                        </p>
                        <p>
                          <span className="text-slate-500">Last visit:</span>{" "}
                          {drawerBooking.bookingHistory?.lastVisit?.startAt
                            ? `${formatDateTime(drawerBooking.bookingHistory.lastVisit.startAt)} · ${drawerBooking.bookingHistory.lastVisit.serviceName || ""}`
                            : "—"}
                        </p>
                        <p>
                          <span className="text-slate-500">Next visit:</span>{" "}
                          {drawerBooking.bookingHistory?.nextVisit?.startAt
                            ? `${formatDateTime(drawerBooking.bookingHistory.nextVisit.startAt)} · ${drawerBooking.bookingHistory.nextVisit.serviceName || ""}`
                            : "—"}
                        </p>
                      </div>
                      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                        {(drawerBooking.bookingHistory?.items || []).map((historyItem) => (
                          <article
                            key={historyItem.id}
                            className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs"
                          >
                            <p className="font-semibold text-slate-100">
                              {historyItem.startAt ? formatDateTime(historyItem.startAt) : "—"} ·{" "}
                              {historyItem.serviceName || "Service"}
                            </p>
                            <p className="text-slate-400">
                              {historyItem.locationName || "—"} ·{" "}
                              {historyItem.status.replaceAll("_", " ")}
                            </p>
                          </article>
                        ))}
                        {(drawerBooking.bookingHistory?.items?.length ?? 0) === 0 && (
                          <p className="text-xs text-slate-500">No previous visits found.</p>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[60] rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
            toast.type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </section>
  );
}
