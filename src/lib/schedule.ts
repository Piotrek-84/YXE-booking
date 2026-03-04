import { EmployeeRole } from "@prisma/client";
import { randomBytes } from "crypto";
import { yxeSchedule } from "../../config/schedules";
import { makeSlotKey } from "./availability-engine";
import { prisma } from "./prisma";

const slotBlockClient = (prisma as any).slotBlock;

const timezoneByLocation: Record<string, string> = {
  YXE: "America/Regina",
  YYC: "America/Edmonton",
};

export const SCHEDULE_SLOT_LINE_COUNT = 4;

function getTimezone(locationCode: string) {
  return timezoneByLocation[locationCode] || "America/Regina";
}

function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getDayOfWeek(date: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function getTimeZoneOffsetString(timeZone: string, date: Date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const normalized = (value || "GMT-0").replace("GMT", "");
  const [hoursRaw, minsRaw] = normalized.split(":");
  const hours = hoursRaw || "-0";
  const sign = hours.startsWith("-") ? "-" : "+";
  const absHours = hours.replace("+", "").replace("-", "").padStart(2, "0");
  const mins = (minsRaw || "00").padStart(2, "0");
  return `${sign}${absHours}:${mins}`;
}

function toZonedDateTimeString(date: Date, time: string, timeZone: string) {
  const { year, month, day } = getDateParts(date, timeZone);
  const offset = getTimeZoneOffsetString(timeZone, date);
  return `${year}-${month}-${day}T${time}:00${offset}`;
}

export function isValidTimeValue(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function toTimeMinutes(value: string) {
  if (!isValidTimeValue(value)) return Number.NaN;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

function toUtcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromUtcDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function getUtcDateRange(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return { start, end };
}

function enumerateUtcDateKeys(from: Date, to: Date) {
  const { start, end } = getUtcDateRange(from, to);
  const values: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    values.push(toUtcDateKey(cursor));
  }
  return values;
}

function resolveSlotTimes(locationCode: string, date: Date) {
  const timeZone = getTimezone(locationCode);
  const dayIndex = getDayOfWeek(date, timeZone);
  const schedule = yxeSchedule.find((item) => item.day === dayIndex);
  return schedule?.slots || [];
}

type ShiftWithEmployee = {
  startTime: string;
  endTime: string;
  isDayOff: boolean;
  employee: {
    role: EmployeeRole;
    isActive: boolean;
  };
};

function countDetailersForSlot(shifts: ShiftWithEmployee[], slotTime: string) {
  const slotMinutes = toTimeMinutes(slotTime);
  if (!Number.isFinite(slotMinutes)) return 0;

  return shifts.reduce((count, shift) => {
    if (shift.isDayOff) return count;
    if (!shift.employee.isActive || shift.employee.role !== "DETAILER") return count;
    const startMinutes = toTimeMinutes(shift.startTime);
    const endMinutes = toTimeMinutes(shift.endTime);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return count;
    if (slotMinutes >= startMinutes && slotMinutes < endMinutes) return count + 1;
    return count;
  }, 0);
}

async function resolveLocation(code: string) {
  const existing = await prisma.location.findUnique({ where: { code } });
  if (existing) return existing;

  if (code !== "YXE" && code !== "YYC") return null;

  return prisma.location.create({
    data: {
      code,
      name: code === "YXE" ? "Saskatoon (YXE)" : "Calgary (YYC)",
    },
  });
}

export async function syncStaffingSlotBlocks(params: {
  locationCode: string;
  dateFrom: Date;
  dateTo?: Date;
}) {
  if (!slotBlockClient) return { syncedSlots: 0, createdBlocks: 0 };

  const location = await resolveLocation(params.locationCode);
  if (!location) return { syncedSlots: 0, createdBlocks: 0 };

  const dateTo = params.dateTo ?? params.dateFrom;
  const dateKeys = enumerateUtcDateKeys(params.dateFrom, dateTo);
  if (!dateKeys.length) return { syncedSlots: 0, createdBlocks: 0 };

  const from = new Date(`${dateKeys[0]}T00:00:00.000Z`);
  const to = new Date(`${dateKeys[dateKeys.length - 1]}T23:59:59.999Z`);
  const shifts = await prisma.employeeShift.findMany({
    where: {
      locationCode: params.locationCode,
      shiftDate: {
        gte: from,
        lte: to,
      },
    },
    include: {
      employee: {
        select: {
          role: true,
          isActive: true,
        },
      },
    },
  });

  const shiftsByDate = new Map<string, ShiftWithEmployee[]>();
  for (const shift of shifts) {
    const dateKey = toUtcDateKey(shift.shiftDate);
    const existing = shiftsByDate.get(dateKey) || [];
    existing.push(shift);
    shiftsByDate.set(dateKey, existing);
  }

  await slotBlockClient.deleteMany({
    where: {
      locationId: location.id,
      isAutoStaffBlock: true,
      startAt: { gte: from, lte: to },
    },
  });

  let createdBlocks = 0;
  let syncedSlots = 0;
  const createRows: Array<{
    locationId: string;
    slotKey: string;
    slotLine: number;
    reason: string;
    blockedBy: string;
    isAutoStaffBlock: boolean;
    startAt: Date;
    endAt: Date;
  }> = [];

  for (const dateKey of dateKeys) {
    const dayDate = dateFromUtcDateKey(dateKey);
    const slotTimes = resolveSlotTimes(params.locationCode, dayDate);
    const dayShifts = shiftsByDate.get(dateKey) || [];
    const timeZone = getTimezone(params.locationCode);

    for (const time of slotTimes) {
      const startAt = new Date(toZonedDateTimeString(dayDate, time, timeZone));
      if (Number.isNaN(startAt.getTime())) continue;

      syncedSlots += 1;
      const detailerCount = countDetailersForSlot(dayShifts, time);
      const openLines = Math.min(Math.max(detailerCount, 0), SCHEDULE_SLOT_LINE_COUNT);
      const slotKey = makeSlotKey(params.locationCode, startAt);
      const reason = `Auto staffing: ${detailerCount} detailer${detailerCount === 1 ? "" : "s"} scheduled`;

      for (let line = openLines + 1; line <= SCHEDULE_SLOT_LINE_COUNT; line += 1) {
        createRows.push({
          locationId: location.id,
          slotKey,
          slotLine: line,
          reason,
          blockedBy: "system:staffing",
          isAutoStaffBlock: true,
          startAt,
          endAt: addMinutes(startAt, 60),
        });
      }
    }
  }

  if (createRows.length > 0) {
    const result = await slotBlockClient.createMany({
      data: createRows,
      skipDuplicates: true,
    });
    createdBlocks = result.count;
  }

  return {
    syncedSlots,
    createdBlocks,
  };
}

export async function syncStaffingForShiftDates(
  entries: Array<{ locationCode: string; shiftDate: Date }>
) {
  const deduped = new Map<string, { locationCode: string; shiftDate: Date }>();
  for (const entry of entries) {
    const key = `${entry.locationCode}:${toUtcDateKey(entry.shiftDate)}`;
    deduped.set(key, entry);
  }

  for (const entry of deduped.values()) {
    await syncStaffingSlotBlocks({
      locationCode: entry.locationCode,
      dateFrom: entry.shiftDate,
      dateTo: entry.shiftDate,
    });
  }
}

export function createScheduleRequestToken() {
  return randomBytes(24).toString("base64url");
}
