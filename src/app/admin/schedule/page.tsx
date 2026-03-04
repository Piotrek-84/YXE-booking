"use client";

import { EmployeeRole, ScheduleRequestStatus } from "@prisma/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Employee = {
  id: string;
  fullName: string;
  scheduleName?: string | null;
  phone: string;
  email: string;
  role: EmployeeRole;
  isActive: boolean;
  createdAt: string;
};

type Shift = {
  id: string;
  employeeId: string;
  locationCode: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  isDayOff: boolean;
  notes?: string | null;
  employee: Employee;
};

type ScheduleRequest = {
  id: string;
  employeeId: string;
  locationCode?: string | null;
  requestType: string;
  requestedDate?: string | null;
  requestedStartTime?: string | null;
  requestedEndTime?: string | null;
  reason: string;
  status: ScheduleRequestStatus;
  reviewNotes?: string | null;
  createdAt: string;
  employee: Employee;
};

const WEEKDAY_SLOTS: Record<number, string[]> = {
  0: ["11:00", "13:00", "15:30"],
  1: ["09:00", "11:00", "13:30", "15:30"],
  2: ["09:00", "11:00", "13:30", "15:30"],
  3: ["09:00", "11:00", "13:30", "15:30"],
  4: ["09:00", "11:00", "13:30", "15:30"],
  5: ["09:00", "11:00", "13:30", "15:30"],
  6: ["09:00", "11:00", "13:30", "15:30"],
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function dateKeyFromIso(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return hours * 60 + minutes;
}

function getOpenLines(shifts: Shift[], slotTime: string) {
  const slotMinutes = toMinutes(slotTime);
  if (!Number.isFinite(slotMinutes)) return 0;
  const detailers = shifts.filter((shift) => {
    if (shift.isDayOff) return false;
    if (!shift.employee.isActive || shift.employee.role !== "DETAILER") return false;
    const start = toMinutes(shift.startTime);
    const end = toMinutes(shift.endTime);
    return (
      Number.isFinite(start) && Number.isFinite(end) && slotMinutes >= start && slotMinutes < end
    );
  });
  return Math.max(0, Math.min(4, detailers.length));
}

function getEmployeeScheduleLabel(employee: Pick<Employee, "fullName" | "scheduleName">) {
  const scheduleName = employee.scheduleName?.trim();
  return scheduleName ? scheduleName : employee.fullName;
}

export default function AdminSchedulePage() {
  const [locationCode, setLocationCode] = useState("YXE");
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [requests, setRequests] = useState<ScheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [employeeForm, setEmployeeForm] = useState({
    fullName: "",
    scheduleName: "",
    phone: "",
    email: "",
    role: "DETAILER" as EmployeeRole,
  });

  const [shiftForm, setShiftForm] = useState({
    employeeId: "",
    shiftDate: toDateKey(new Date()),
    startTime: "09:00",
    endTime: "17:00",
    notes: "",
  });
  const [selectedDayKey, setSelectedDayKey] = useState(toDateKey(new Date()));
  const dayEditorRef = useRef<HTMLDivElement | null>(null);

  const calendarRange = useMemo(() => {
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
  }, [calendarCursor, calendarMode]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    for (
      let cursor = new Date(calendarRange.from);
      cursor <= calendarRange.to;
      cursor = addDays(cursor, 1)
    ) {
      days.push(new Date(cursor));
    }
    return days;
  }, [calendarRange]);

  useEffect(() => {
    if (calendarMode === "day") {
      const dayKey = toDateKey(calendarCursor);
      setSelectedDayKey(dayKey);
      setShiftForm((prev) => ({ ...prev, shiftDate: dayKey }));
      return;
    }

    const current = fromDateKey(selectedDayKey);
    if (current < calendarRange.from || current > calendarRange.to) {
      const nextDayKey = toDateKey(calendarRange.from);
      setSelectedDayKey(nextDayKey);
      setShiftForm((prev) => ({ ...prev, shiftDate: nextDayKey }));
    }
  }, [calendarMode, calendarCursor, calendarRange.from, calendarRange.to, selectedDayKey]);

  useEffect(() => {
    const firstActive = employees.find((employee) => employee.isActive);
    if (!firstActive) return;
    setShiftForm((prev) => (prev.employeeId ? prev : { ...prev, employeeId: firstActive.id }));
  }, [employees]);

  const loadEmployees = useCallback(async () => {
    const response = await fetch("/api/admin/employees?scope=all", { credentials: "include" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Could not load employees.");
    }
    const data = await response.json().catch(() => ({}));
    setEmployees(Array.isArray(data?.employees) ? data.employees : []);
  }, []);

  const loadShifts = useCallback(async () => {
    const params = new URLSearchParams({
      locationCode,
      dateFrom: toDateKey(calendarRange.from),
      dateTo: toDateKey(calendarRange.to),
    });
    const response = await fetch(`/api/admin/schedule/shifts?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Could not load shifts.");
    }
    const data = await response.json().catch(() => ({}));
    setShifts(Array.isArray(data?.shifts) ? data.shifts : []);
  }, [calendarRange.from, calendarRange.to, locationCode]);

  const loadRequests = useCallback(async () => {
    const params = new URLSearchParams({ locationCode });
    const response = await fetch(`/api/admin/schedule/requests?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Could not load schedule requests.");
    }
    const data = await response.json().catch(() => ({}));
    setRequests(Array.isArray(data?.requests) ? data.requests : []);
  }, [locationCode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadEmployees(), loadShifts(), loadRequests()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load schedule data.");
    } finally {
      setLoading(false);
    }
  }, [loadEmployees, loadRequests, loadShifts]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const addEmployee = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(employeeForm),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data?.error || "Could not add employee.");
      return;
    }
    setEmployeeForm({ fullName: "", scheduleName: "", phone: "", email: "", role: "DETAILER" });
    setMessage("Employee added.");
    await loadEmployees();
  };

  const updateEmployeeRole = async (id: string, role: EmployeeRole) => {
    setError("");
    const response = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, role }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not update employee role.");
      return;
    }
    await Promise.all([loadEmployees(), loadShifts()]);
  };

  const toggleEmployeeActive = async (id: string, isActive: boolean) => {
    setError("");
    const response = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, isActive }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not update employee.");
      return;
    }
    await Promise.all([loadEmployees(), loadShifts()]);
  };

  const updateEmployeeScheduleName = async (employee: Employee) => {
    const nextScheduleName = window.prompt(
      "Schedule name (what should show on calendar)",
      employee.scheduleName || ""
    );
    if (nextScheduleName === null) return;
    setError("");
    const response = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: employee.id,
        scheduleName: nextScheduleName.trim() || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not update schedule name.");
      return;
    }
    setMessage("Schedule name updated.");
    await Promise.all([loadEmployees(), loadShifts()]);
  };

  const removeEmployee = async (id: string) => {
    if (!window.confirm("Remove this employee and all their shifts?")) return;
    setError("");
    const response = await fetch(`/api/admin/employees?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not remove employee.");
      return;
    }
    setMessage("Employee removed.");
    await Promise.all([loadEmployees(), loadShifts()]);
  };

  const createShift = async (params: {
    employeeId: string;
    shiftDate: string;
    startTime: string;
    endTime: string;
    isDayOff?: boolean;
    notes?: string;
  }) => {
    const fallbackEmployeeId =
      params.employeeId || employees.find((employee) => employee.isActive)?.id || "";
    if (!fallbackEmployeeId) {
      setError("Pick an employee before creating a shift.");
      return false;
    }
    if (!params.employeeId && fallbackEmployeeId) {
      setShiftForm((prev) => ({ ...prev, employeeId: fallbackEmployeeId }));
    }
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/schedule/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        employeeId: fallbackEmployeeId,
        locationCode,
        shiftDate: params.shiftDate,
        startTime: params.startTime,
        endTime: params.endTime,
        isDayOff: params.isDayOff ?? false,
        notes: params.notes,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data?.error || "Could not create shift.");
      return false;
    }
    setMessage(data?.warning || "Shift created and staffing lanes synced.");
    return true;
  };

  const clearEmployeeAssignmentsForDay = async (employeeId: string, dateKey: string) => {
    const employeeDayShifts = (shiftsByDate.get(dateKey) || []).filter(
      (shift) => shift.employeeId === employeeId
    );
    if (employeeDayShifts.length === 0) {
      return { ok: true as const, removedCount: 0, warning: "" };
    }

    let warning = "";
    for (const shift of employeeDayShifts) {
      const response = await fetch(
        `/api/admin/schedule/shifts?id=${encodeURIComponent(shift.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false as const,
          removedCount: 0,
          warning: "",
          error: data?.error || "Could not remove employee from this day.",
        };
      }
      if (!warning && data?.warning) {
        warning = data.warning;
      }
    }

    return { ok: true as const, removedCount: employeeDayShifts.length, warning };
  };

  const addEmployeeWorkForDay = async (employeeId: string, dateKey: string) => {
    setError("");
    const cleared = await clearEmployeeAssignmentsForDay(employeeId, dateKey);
    if (!cleared.ok) {
      setError(cleared.error);
      return;
    }
    const created = await createShift({
      employeeId,
      shiftDate: dateKey,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      isDayOff: false,
    });
    if (!created) return;
    setMessage(cleared.warning || "Employee assigned to selected day.");
    await loadShifts();
  };

  const addEmployeeDayOffForDay = async (employeeId: string, dateKey: string) => {
    setError("");
    const cleared = await clearEmployeeAssignmentsForDay(employeeId, dateKey);
    if (!cleared.ok) {
      setError(cleared.error);
      return;
    }
    const created = await createShift({
      employeeId,
      shiftDate: dateKey,
      startTime: "00:00",
      endTime: "23:59",
      isDayOff: true,
    });
    if (!created) return;
    setMessage(cleared.warning || "Employee marked as day off.");
    await loadShifts();
  };

  const removeEmployeeFromDay = async (employeeId: string, dateKey: string) => {
    setError("");
    const cleared = await clearEmployeeAssignmentsForDay(employeeId, dateKey);
    if (!cleared.ok) {
      setError(cleared.error);
      return;
    }
    if (cleared.removedCount === 0) {
      setMessage("Employee is not assigned on this day.");
      return;
    }
    setMessage(cleared.warning || "Employee removed from selected day.");
    await loadShifts();
  };

  const openDayEditor = (dateKey: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    setSelectedDayKey(dateKey);
    setShiftForm((prev) => ({ ...prev, shiftDate: dateKey }));
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        dayEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const removeShift = async (id: string) => {
    setError("");
    const response = await fetch(`/api/admin/schedule/shifts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not remove shift.");
      return;
    }
    if (data?.warning) {
      setMessage(data.warning);
    }
    await loadShifts();
  };

  const markShiftAsDayOff = async (id: string) => {
    setError("");
    const response = await fetch("/api/admin/schedule/shifts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, isDayOff: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not mark day off.");
      return;
    }
    if (data?.warning) {
      setMessage(data.warning);
    } else {
      setMessage("Marked as day off.");
    }
    await loadShifts();
  };

  const publishScheduleEmails = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/schedule/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        locationCode,
        dateFrom: toDateKey(calendarRange.from),
        dateTo: toDateKey(calendarRange.to),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(data?.error || "Could not send schedule emails.");
      return;
    }
    setMessage(`Emails sent: ${data?.sentCount ?? 0}. Failed: ${data?.failedCount ?? 0}.`);
  };

  const reviewRequest = async (id: string, status: ScheduleRequestStatus) => {
    const reviewNotes = window.prompt("Optional review note:") || "";
    const response = await fetch("/api/admin/schedule/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, status, reviewNotes }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not update request.");
      return;
    }
    await loadRequests();
  };

  const setupScheduleSchema = async () => {
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/setup-schedule", {
      method: "POST",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.error || "Could not run schedule setup.");
      return;
    }
    setMessage("Schedule tables created. Reloading data...");
    await loadAll();
  };

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, Shift[]>();
    for (const shift of shifts) {
      const dateKey = dateKeyFromIso(shift.shiftDate);
      if (!dateKey) continue;
      const list = grouped.get(dateKey) || [];
      list.push(shift);
      grouped.set(dateKey, list);
    }
    return grouped;
  }, [shifts]);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [employees]);

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-700">
            {(["YXE", "YYC"] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLocationCode(code)}
                className={`px-3 py-2 text-xs font-semibold ${
                  locationCode === code
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-950 text-slate-200"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-700">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCalendarMode(mode)}
                className={`px-3 py-2 text-xs font-semibold uppercase ${
                  calendarMode === mode
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-950 text-slate-200"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              setCalendarCursor((current) =>
                addDays(current, calendarMode === "day" ? -1 : calendarMode === "week" ? -7 : -30)
              )
            }
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
          >
            Prev
          </button>
          <button
            onClick={() => {
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              setCalendarCursor(now);
            }}
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
          >
            Today
          </button>
          <button
            onClick={() =>
              setCalendarCursor((current) =>
                addDays(current, calendarMode === "day" ? 1 : calendarMode === "week" ? 7 : 30)
              )
            }
            className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
          >
            Next
          </button>
          <button
            onClick={() => void publishScheduleEmails()}
            disabled={saving}
            className="ml-auto rounded-xl border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
          >
            Email schedule for current range
          </button>
          <button
            onClick={() => void setupScheduleSchema()}
            className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100"
          >
            Repair schedule tables
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Showing {formatDayLabel(calendarRange.from)} to {formatDayLabel(calendarRange.to)}.
        </p>
      </section>

      {(error || message) && (
        <section
          className={`rounded-2xl border p-3 text-sm ${
            error
              ? "border-rose-800/60 bg-rose-950/20 text-rose-200"
              : "border-emerald-800/60 bg-emerald-950/20 text-emerald-200"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{error || message}</span>
            {error.includes("Schedule tables are not ready yet") && (
              <button
                onClick={() => void setupScheduleSchema()}
                className="rounded-lg border border-slate-500 px-2 py-1 text-xs font-semibold text-slate-100"
              >
                Run setup now
              </button>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-4">
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-100">Add Employee</p>
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={employeeForm.fullName}
              onChange={(event) =>
                setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
              placeholder="Full name"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={employeeForm.scheduleName}
              onChange={(event) =>
                setEmployeeForm((prev) => ({ ...prev, scheduleName: event.target.value }))
              }
              placeholder="Schedule name (optional)"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={employeeForm.phone}
              onChange={(event) =>
                setEmployeeForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              placeholder="Phone"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <input
              value={employeeForm.email}
              onChange={(event) =>
                setEmployeeForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="Email"
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <select
              value={employeeForm.role}
              onChange={(event) =>
                setEmployeeForm((prev) => ({ ...prev, role: event.target.value as EmployeeRole }))
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="DETAILER">Detailer</option>
              <option value="SUPERVISOR">Supervisor</option>
            </select>
          </div>
          <button
            onClick={() => void addEmployee()}
            disabled={saving}
            className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-100 disabled:opacity-50"
          >
            Add employee
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-100">Employees</p>
        {loading && <p className="text-sm text-slate-400">Loading employees…</p>}
        {!loading && employees.length === 0 && (
          <p className="text-sm text-slate-400">No employees yet.</p>
        )}
        {!loading && employees.length > 0 && (
          <div className="grid gap-2">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 md:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                <div>
                  <p className="font-semibold text-slate-100">{employee.fullName}</p>
                  <p className="text-xs text-slate-400">
                    {employee.phone} · {employee.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    Schedule name: {employee.scheduleName?.trim() || "-"}
                  </p>
                </div>
                <select
                  value={employee.role}
                  onChange={(event) =>
                    void updateEmployeeRole(employee.id, event.target.value as EmployeeRole)
                  }
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                >
                  <option value="DETAILER">Detailer</option>
                  <option value="SUPERVISOR">Supervisor</option>
                </select>
                <button
                  onClick={() => void toggleEmployeeActive(employee.id, !employee.isActive)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    employee.isActive
                      ? "border-amber-700 text-amber-200"
                      : "border-emerald-700 text-emerald-200"
                  }`}
                >
                  {employee.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => void updateEmployeeScheduleName(employee)}
                  className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-200"
                >
                  Schedule name
                </button>
                <button
                  onClick={() => void removeEmployee(employee.id)}
                  className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-200"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Schedule Calendar</p>
            <p className="text-xs text-slate-400">Only detailers open lanes. Supervisors do not.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <span>Selected day</span>
            <input
              type="date"
              value={selectedDayKey}
              onChange={(event) => openDayEditor(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
        </div>

        {calendarMode === "day" && (
          <div className="space-y-3">
            {(() => {
              const dayKey = toDateKey(calendarCursor);
              const dayShifts = (shiftsByDate.get(dayKey) || []).sort((a, b) =>
                a.startTime.localeCompare(b.startTime)
              );
              const dayOffShifts = dayShifts.filter((shift) => shift.isDayOff);
              const slots = WEEKDAY_SLOTS[calendarCursor.getDay()] || [];
              return (
                <>
                  <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-sm text-slate-300">{formatDayLabel(calendarCursor)}</p>
                    <p className="text-xs text-slate-500">
                      Use employee list below to edit this day
                    </p>
                  </div>
                  {dayOffShifts.length > 0 && (
                    <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-300">
                        Day Off
                      </p>
                      <div className="mt-2 grid gap-1">
                        {dayOffShifts.map((shift) => (
                          <button
                            key={shift.id}
                            onClick={() => void removeShift(shift.id)}
                            className="rounded border border-amber-700/70 px-2 py-1 text-left text-xs text-amber-100 hover:bg-amber-900/30"
                          >
                            {getEmployeeScheduleLabel(shift.employee)} · DAY OFF (click to remove)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {slots.map((time) => {
                      const openLines = getOpenLines(dayShifts, time);
                      const blockedLines = Array.from(
                        { length: 4 },
                        (_, index) => index + 1
                      ).filter((line) => line > openLines);
                      const activeAtSlot = dayShifts.filter((shift) => {
                        if (shift.isDayOff) return false;
                        const slotMinutes = toMinutes(time);
                        const start = toMinutes(shift.startTime);
                        const end = toMinutes(shift.endTime);
                        return (
                          Number.isFinite(start) &&
                          Number.isFinite(end) &&
                          slotMinutes >= start &&
                          slotMinutes < end
                        );
                      });

                      return (
                        <div
                          key={time}
                          className="rounded-xl border border-slate-800 bg-slate-950 p-3"
                        >
                          <p className="text-sm font-semibold text-slate-100">{time}</p>
                          <p className="text-xs text-slate-300">
                            Open lanes: {openLines} / 4
                            {blockedLines.length > 0
                              ? ` · Blocked lanes: ${blockedLines.join(", ")}`
                              : ""}
                          </p>
                          <div className="mt-2 grid gap-1">
                            {activeAtSlot.length === 0 && (
                              <p className="text-xs text-slate-500">
                                No one scheduled at this time.
                              </p>
                            )}
                            {activeAtSlot.map((shift) => (
                              <div
                                key={`${shift.id}-${time}`}
                                className="rounded border border-slate-800 px-2 py-1 text-xs text-slate-300"
                              >
                                {getEmployeeScheduleLabel(shift.employee)} (
                                {shift.employee.role.toLowerCase()}) · {shift.startTime} -{" "}
                                {shift.endTime}
                                <button
                                  onClick={() => void removeShift(shift.id)}
                                  className="ml-2 rounded border border-rose-700 px-1 py-0.5 text-[10px] text-rose-200"
                                >
                                  remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {calendarMode === "week" && (
          <div className="grid gap-3 md:grid-cols-7">
            {calendarDays.map((day) => {
              const dayKey = toDateKey(day);
              const dayShifts = (shiftsByDate.get(dayKey) || []).sort((a, b) =>
                a.startTime.localeCompare(b.startTime)
              );
              return (
                <button
                  type="button"
                  key={dayKey}
                  onClick={() => openDayEditor(dayKey)}
                  className={`cursor-pointer rounded-xl border bg-slate-950 p-3 text-left ${
                    dayKey === selectedDayKey
                      ? "border-slate-200 ring-1 ring-slate-300"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {day.toLocaleDateString("en-CA", { weekday: "short" })}
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {day.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </p>
                  <div className="mt-2 space-y-1">
                    {dayShifts.length === 0 && <p className="text-xs text-slate-500">No shifts</p>}
                    {dayShifts.slice(0, 3).map((shift) => (
                      <p key={shift.id} className="truncate text-[11px] text-slate-300">
                        {shift.isDayOff
                          ? `${getEmployeeScheduleLabel(shift.employee)} · DAY OFF`
                          : `${shift.startTime}-${shift.endTime} ${getEmployeeScheduleLabel(shift.employee)}`}
                      </p>
                    ))}
                    {dayShifts.length > 3 && (
                      <p className="text-[11px] text-slate-500">+{dayShifts.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {calendarMode === "month" && (
          <>
            <div className="grid gap-3 md:grid-cols-7">
              {calendarDays.map((day) => {
                const dayKey = toDateKey(day);
                const dayShifts = shiftsByDate.get(dayKey) || [];
                const detailerCount = dayShifts.filter(
                  (shift) =>
                    !shift.isDayOff && shift.employee.isActive && shift.employee.role === "DETAILER"
                ).length;
                const isSelected = dayKey === selectedDayKey;
                return (
                  <button
                    type="button"
                    key={dayKey}
                    onClick={() => openDayEditor(dayKey)}
                    className={`min-h-[120px] cursor-pointer rounded-xl border bg-slate-950 p-3 text-left ${
                      isSelected
                        ? "border-slate-200 ring-1 ring-slate-300"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-100">{day.getDate()}</p>
                    <p className="text-xs text-slate-400">{dayShifts.length} shifts</p>
                    <p className="text-xs text-slate-500">{detailerCount} detailer shifts</p>
                    <div className="mt-2 space-y-1">
                      {dayShifts.slice(0, 3).map((shift) => (
                        <p key={shift.id} className="truncate text-[11px] text-slate-300">
                          {shift.isDayOff
                            ? `${getEmployeeScheduleLabel(shift.employee)} · DAY OFF`
                            : `${shift.startTime} ${getEmployeeScheduleLabel(shift.employee)}`}
                        </p>
                      ))}
                      {dayShifts.length > 3 && (
                        <p className="text-[11px] text-slate-500">+{dayShifts.length - 3} more</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {(() => {
              const selectedDate = fromDateKey(selectedDayKey);
              const selectedShifts = (shiftsByDate.get(selectedDayKey) || []).sort((a, b) =>
                a.startTime.localeCompare(b.startTime)
              );
              return (
                <div
                  id="schedule-day-editor"
                  ref={dayEditorRef}
                  className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
                >
                  <p className="text-sm font-semibold text-slate-100">
                    {formatDayLabel(selectedDate)} quick assign
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Click any day above, then add or remove employees for that day.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-400">Work shift hours:</p>
                    <input
                      type="time"
                      value={shiftForm.startTime}
                      onChange={(event) =>
                        setShiftForm((prev) => ({ ...prev, startTime: event.target.value }))
                      }
                      className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="time"
                      value={shiftForm.endTime}
                      onChange={(event) =>
                        setShiftForm((prev) => ({ ...prev, endTime: event.target.value }))
                      }
                      className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                  <div className="mt-3 grid gap-2">
                    {selectedShifts.length === 0 && (
                      <p className="text-xs text-slate-500">No shifts on this day yet.</p>
                    )}
                    {selectedShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className={`rounded border px-3 py-2 text-left text-xs ${
                          shift.isDayOff
                            ? "border-amber-700/70 bg-amber-950/20 text-amber-100"
                            : "border-slate-800 text-slate-300"
                        }`}
                      >
                        <span className="font-semibold">
                          {getEmployeeScheduleLabel(shift.employee)}
                        </span>
                        {" · "}
                        {shift.isDayOff ? "DAY OFF" : `${shift.startTime}-${shift.endTime}`}
                        {" · "}
                        {shift.employee.role.toLowerCase()}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => void removeShift(shift.id)}
                            className="rounded border border-rose-700 px-2 py-1 text-[10px] text-rose-200"
                          >
                            remove
                          </button>
                          {!shift.isDayOff && (
                            <button
                              onClick={() => void markShiftAsDayOff(shift.id)}
                              className="rounded border border-amber-700 px-2 py-1 text-[10px] text-amber-200"
                            >
                              day off
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                      One-click employee assignment
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      For {formatDayLabel(selectedDate)} use one-click add work, day off, or remove.
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {sortedEmployees.map((employee) => {
                        const employeeShifts = selectedShifts.filter(
                          (shift) => shift.employeeId === employee.id
                        );
                        return (
                          <div
                            key={`${selectedDayKey}-${employee.id}`}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              employee.isActive
                                ? "border-slate-700 text-slate-200"
                                : "border-slate-800 text-slate-500"
                            }`}
                          >
                            <p className="font-semibold">{getEmployeeScheduleLabel(employee)}</p>
                            <p className="text-[11px] text-slate-500">
                              {employee.role.toLowerCase()} ·{" "}
                              {employee.isActive ? "active" : "inactive"}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {employeeShifts.length === 0
                                ? "Not assigned"
                                : employeeShifts
                                    .map((shift) =>
                                      shift.isDayOff
                                        ? "DAY OFF"
                                        : `${shift.startTime}-${shift.endTime}`
                                    )
                                    .join(", ")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <button
                                onClick={() =>
                                  void addEmployeeWorkForDay(employee.id, selectedDayKey)
                                }
                                disabled={!employee.isActive || saving}
                                className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-100 disabled:opacity-40"
                              >
                                Add work
                              </button>
                              <button
                                onClick={() =>
                                  void addEmployeeDayOffForDay(employee.id, selectedDayKey)
                                }
                                disabled={!employee.isActive || saving}
                                className="rounded border border-amber-700 px-2 py-1 text-[10px] text-amber-200 disabled:opacity-40"
                              >
                                Day off
                              </button>
                              <button
                                onClick={() =>
                                  void removeEmployeeFromDay(employee.id, selectedDayKey)
                                }
                                disabled={saving}
                                className="rounded border border-rose-700 px-2 py-1 text-[10px] text-rose-200 disabled:opacity-40"
                              >
                                Remove day
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {calendarMode !== "month" &&
          (() => {
            const selectedDate = fromDateKey(selectedDayKey);
            const selectedShifts = (shiftsByDate.get(selectedDayKey) || []).sort((a, b) =>
              a.startTime.localeCompare(b.startTime)
            );
            return (
              <div
                id="schedule-day-editor"
                ref={dayEditorRef}
                className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
              >
                <p className="text-sm font-semibold text-slate-100">
                  {formatDayLabel(selectedDate)} quick assign
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Click any day above, then use employee list below for add/remove/day off.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-400">Work shift hours:</p>
                  <input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(event) =>
                      setShiftForm((prev) => ({ ...prev, startTime: event.target.value }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(event) =>
                      setShiftForm((prev) => ({ ...prev, endTime: event.target.value }))
                    }
                    className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  {selectedShifts.length === 0 && (
                    <p className="text-xs text-slate-500">No shifts on this day yet.</p>
                  )}
                  {selectedShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className={`rounded border px-3 py-2 text-left text-xs ${
                        shift.isDayOff
                          ? "border-amber-700/70 bg-amber-950/20 text-amber-100"
                          : "border-slate-800 text-slate-300"
                      }`}
                    >
                      <span className="font-semibold">
                        {getEmployeeScheduleLabel(shift.employee)}
                      </span>
                      {" · "}
                      {shift.isDayOff ? "DAY OFF" : `${shift.startTime}-${shift.endTime}`}
                      {" · "}
                      {shift.employee.role.toLowerCase()}
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void removeShift(shift.id)}
                          className="rounded border border-rose-700 px-2 py-1 text-[10px] text-rose-200"
                        >
                          remove
                        </button>
                        {!shift.isDayOff && (
                          <button
                            onClick={() => void markShiftAsDayOff(shift.id)}
                            className="rounded border border-amber-700 px-2 py-1 text-[10px] text-amber-200"
                          >
                            day off
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                    One-click employee assignment
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    For {formatDayLabel(selectedDate)} use one-click add work, day off, or remove.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {sortedEmployees.map((employee) => {
                      const employeeShifts = selectedShifts.filter(
                        (shift) => shift.employeeId === employee.id
                      );
                      return (
                        <div
                          key={`${selectedDayKey}-quick-${employee.id}`}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            employee.isActive
                              ? "border-slate-700 text-slate-200"
                              : "border-slate-800 text-slate-500"
                          }`}
                        >
                          <p className="font-semibold">{getEmployeeScheduleLabel(employee)}</p>
                          <p className="text-[11px] text-slate-500">
                            {employee.role.toLowerCase()} ·{" "}
                            {employee.isActive ? "active" : "inactive"}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {employeeShifts.length === 0
                              ? "Not assigned"
                              : employeeShifts
                                  .map((shift) =>
                                    shift.isDayOff
                                      ? "DAY OFF"
                                      : `${shift.startTime}-${shift.endTime}`
                                  )
                                  .join(", ")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button
                              onClick={() =>
                                void addEmployeeWorkForDay(employee.id, selectedDayKey)
                              }
                              disabled={!employee.isActive || saving}
                              className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-100 disabled:opacity-40"
                            >
                              Add work
                            </button>
                            <button
                              onClick={() =>
                                void addEmployeeDayOffForDay(employee.id, selectedDayKey)
                              }
                              disabled={!employee.isActive || saving}
                              className="rounded border border-amber-700 px-2 py-1 text-[10px] text-amber-200 disabled:opacity-40"
                            >
                              Day off
                            </button>
                            <button
                              onClick={() =>
                                void removeEmployeeFromDay(employee.id, selectedDayKey)
                              }
                              disabled={saving}
                              className="rounded border border-rose-700 px-2 py-1 text-[10px] text-rose-200 disabled:opacity-40"
                            >
                              Remove day
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-100">Schedule Change Requests</p>
        {requests.length === 0 && <p className="text-sm text-slate-400">No requests yet.</p>}
        {requests.length > 0 && (
          <div className="space-y-2">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"
              >
                <p className="font-semibold text-slate-100">
                  {request.employee.fullName} · {request.requestType}
                </p>
                <p className="text-xs text-slate-400">
                  Submitted {formatDateTime(request.createdAt)} · Status: {request.status}
                </p>
                <p className="mt-1 text-xs text-slate-300">{request.reason}</p>
                <p className="text-xs text-slate-500">
                  {request.requestedDate
                    ? `Date: ${formatDayLabel(fromDateKey(dateKeyFromIso(request.requestedDate)))}`
                    : "Date: not specified"}
                  {(request.requestedStartTime || request.requestedEndTime) &&
                    ` · ${request.requestedStartTime || "--:--"}-${request.requestedEndTime || "--:--"}`}
                </p>
                {request.status === "PENDING" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void reviewRequest(request.id, "APPROVED")}
                      className="rounded-lg border border-emerald-700 px-2 py-1 text-xs text-emerald-200"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => void reviewRequest(request.id, "REJECTED")}
                      className="rounded-lg border border-rose-700 px-2 py-1 text-xs text-rose-200"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
