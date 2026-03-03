import { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { SLOT_WINDOW_DAYS, yxeSchedule } from "../../config/schedules";

const slotBlockClient = (prisma as any).slotBlock;

const ACTIVE_STATUSES: BookingStatus[] = [
  "REQUESTED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS"
];

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_CAPACITY = 4;

const fallbackSchedulesByLocation: Record<string, { day: number; slots: string[] }[]> = {
  YXE: yxeSchedule,
  YYC: yxeSchedule
};

const timezoneByLocation: Record<string, string> = {
  YXE: "America/Regina",
  YYC: "America/Edmonton"
};

export type AvailableSlot = {
  startAt: string;
  endAt: string;
  label: string;
  slotKey: string;
  remainingCapacity: number;
  isAvailable: boolean;
};

function getTimezone(locationCode: string) {
  return timezoneByLocation[locationCode] || "America/Regina";
}

async function resolveAvailabilityLocation(locationCode: string) {
  const existing = await prisma.location.findUnique({ where: { code: locationCode } });
  if (existing) return existing;

  if (locationCode !== "YXE" && locationCode !== "YYC") return null;

  // Bootstrap canonical locations for fresh databases so availability works before first booking write.
  return prisma.location.upsert({
    where: { code: locationCode },
    update: {},
    create: {
      code: locationCode,
      name: locationCode === "YXE" ? "Saskatoon (YXE)" : "Calgary (YYC)"
    }
  });
}

function getDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function getDayOfWeek(date: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short"
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function getTimeZoneOffsetString(timeZone: string, date: Date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset"
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

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

export function makeSlotKey(locationCode: string, startAt: Date) {
  return `${locationCode}:${startAt.toISOString().slice(0, 16)}`;
}

export async function getAvailableSlots(params: {
  locationCode: string;
  serviceId?: string;
  serviceDurationMinutes?: number;
  serviceBufferMinutes?: number;
  from?: Date;
  to?: Date;
}) {
  const now = new Date();
  const from = params.from ?? now;
  const to = params.to ?? addMinutes(new Date(from), SLOT_WINDOW_DAYS * 24 * 60);

  const location = await resolveAvailabilityLocation(params.locationCode);
  if (!location) return [] as AvailableSlot[];

  const service =
    params.serviceId
      ? await prisma.service.findFirst({
          where: {
            id: params.serviceId,
            locationId: location.id,
            active: true
          }
        })
      : null;

  const durationMinutes = service?.durationMinutes ?? params.serviceDurationMinutes ?? 60;
  const bufferMinutes = service?.bufferMinutes ?? params.serviceBufferMinutes ?? 0;

  const [capacityRule, locationHours, overrides, blackouts, slotBlocks] = await Promise.all([
    prisma.capacityRule.findUnique({ where: { locationId: location.id } }),
    prisma.locationHours.findMany({ where: { locationId: location.id } }),
    prisma.availabilityOverride.findMany({
      where: {
        locationId: location.id,
        date: {
          gte: new Date(from.toISOString().slice(0, 10)),
          lte: new Date(to.toISOString().slice(0, 10))
        }
      }
    }),
    prisma.blackoutDate.findMany({
      where: {
        locationId: location.id,
        OR: [{ startAt: { lte: to }, endAt: { gte: from } }]
      }
    }),
    slotBlockClient
      ? slotBlockClient.findMany({
          where: {
            locationId: location.id,
            startAt: { gte: from, lte: to }
          },
          select: {
            slotKey: true,
            slotLine: true
          }
        })
      : Promise.resolve([])
  ]);

  const timeZone = getTimezone(params.locationCode);
  const intervalMinutes = capacityRule?.slotIntervalMinutes || DEFAULT_INTERVAL_MINUTES;
  const maxPerSlot = capacityRule?.maxBookingsPerSlot || DEFAULT_CAPACITY;

  const slots: { startAt: Date; endAt: Date; slotKey: string; label: string }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  const lastDate = new Date(to);
  lastDate.setHours(23, 59, 59, 999);

  while (cursor <= lastDate) {
    const dayIndex = getDayOfWeek(cursor, timeZone);
    const ymd = `${getDateParts(cursor, timeZone).year}-${getDateParts(cursor, timeZone).month}-${getDateParts(cursor, timeZone).day}`;

    const isBlackout = blackouts.some((blackout) => {
      const dayStart = new Date(`${ymd}T00:00:00${getTimeZoneOffsetString(timeZone, cursor)}`);
      const dayEnd = new Date(`${ymd}T23:59:59${getTimeZoneOffsetString(timeZone, cursor)}`);
      return blackout.startAt <= dayEnd && blackout.endAt >= dayStart;
    });

    if (!isBlackout) {
      const override = overrides.find(
        (item) => getDateParts(item.date, timeZone).year + "-" + getDateParts(item.date, timeZone).month + "-" + getDateParts(item.date, timeZone).day === ymd
      );

      let openTime: string | null = null;
      let closeTime: string | null = null;
      let isClosed = false;

      if (override) {
        isClosed = override.isClosed;
        openTime = override.openTime;
        closeTime = override.closeTime;
      } else if (locationHours.length > 0) {
        const hours = locationHours.find((item) => item.weekday === dayIndex);
        if (hours) {
          isClosed = hours.isClosed;
          openTime = hours.openTime;
          closeTime = hours.closeTime;
        }
      } else {
        const fallback = fallbackSchedulesByLocation[params.locationCode]?.find((item) => item.day === dayIndex);
        if (fallback?.slots?.length) {
          for (const time of fallback.slots) {
            const startString = toZonedDateTimeString(cursor, time, timeZone);
            const startAt = new Date(startString);
            if (Number.isNaN(startAt.getTime()) || startAt <= now) continue;
            const endAt = addMinutes(startAt, durationMinutes + bufferMinutes);
            slots.push({
              startAt,
              endAt,
              slotKey: makeSlotKey(params.locationCode, startAt),
              label: `${startAt.toLocaleDateString("en-CA", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone
              })} — ${startAt.toLocaleTimeString("en-CA", {
                hour: "numeric",
                minute: "2-digit",
                timeZone
              })}`
            });
          }
        }
      }

      if (!isClosed && openTime && closeTime) {
        const dayStart = new Date(toZonedDateTimeString(cursor, openTime, timeZone));
        const dayEnd = new Date(toZonedDateTimeString(cursor, closeTime, timeZone));
        const latestStart = addMinutes(dayEnd, -(durationMinutes + bufferMinutes));

        for (
          let startAt = new Date(dayStart);
          startAt <= latestStart;
          startAt = addMinutes(startAt, intervalMinutes)
        ) {
          if (startAt <= now) continue;
          const endAt = addMinutes(startAt, durationMinutes + bufferMinutes);
          slots.push({
            startAt,
            endAt,
            slotKey: makeSlotKey(params.locationCode, startAt),
            label: `${startAt.toLocaleDateString("en-CA", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone
            })} — ${startAt.toLocaleTimeString("en-CA", {
              hour: "numeric",
              minute: "2-digit",
              timeZone
            })}`
          });
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (slots.length === 0) return [] as AvailableSlot[];

  const slotKeys = Array.from(new Set(slots.map((slot) => slot.slotKey)));
  const grouped = await prisma.booking.groupBy({
    by: ["slotKey"],
    where: {
      locationId: location.id,
      status: { in: ACTIVE_STATUSES },
      slotKey: { in: slotKeys }
    },
    _count: { _all: true }
  });

  const counts = new Map<string, number>();
  grouped.forEach((row) => {
    if (row.slotKey) counts.set(row.slotKey, row._count._all);
  });

  const blockedCounts = new Map<string, number>();
  slotBlocks.forEach((block: { slotKey: string; slotLine: number }) => {
    const current = blockedCounts.get(block.slotKey) ?? 0;
    blockedCounts.set(block.slotKey, current + 1);
  });

  return slots
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((slot) => {
      const used = counts.get(slot.slotKey) ?? 0;
      const blocked = blockedCounts.get(slot.slotKey) ?? 0;
      const adjustedCapacity = Math.max(maxPerSlot - blocked, 0);
      const remainingCapacity = Math.max(adjustedCapacity - used, 0);
      return {
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        slotKey: slot.slotKey,
        label: slot.label,
        remainingCapacity,
        isAvailable: remainingCapacity > 0
      };
    });
}

export async function validateBookingRequest(params: {
  locationCode: string;
  startAt: Date;
  serviceId: string;
}) {
  if (Number.isNaN(params.startAt.getTime())) {
    throw new Error("Invalid date/time selected.");
  }
  if (params.startAt <= new Date()) {
    throw new Error("Selected time is in the past. Please choose another slot.");
  }

  const slots = await getAvailableSlots({
    locationCode: params.locationCode,
    serviceId: params.serviceId,
    from: new Date(),
    to: addMinutes(new Date(), SLOT_WINDOW_DAYS * 24 * 60)
  });

  const slot = slots.find((item) => item.startAt === params.startAt.toISOString());
  if (!slot) {
    throw new Error("Selected time is not available.");
  }

  if (!slot.isAvailable) {
    throw new Error("That time just filled up—please pick another time.");
  }

  return slot;
}

export async function allocateSlotSequence(params: {
  tx: Prisma.TransactionClient;
  locationId: string;
  slotKey: string;
  startAt: Date;
  maxPerSlot: number;
}) {
  const activeBookings = await params.tx.booking.findMany({
    where: {
      locationId: params.locationId,
      slotKey: params.slotKey,
      startAt: params.startAt,
      status: { in: ACTIVE_STATUSES }
    },
    select: { slotSequence: true }
  });

  const used = new Set(activeBookings.map((item) => item.slotSequence).filter((value): value is number => typeof value === "number"));

  for (let i = 1; i <= params.maxPerSlot; i += 1) {
    if (!used.has(i)) return i;
  }

  throw new Error("That time just filled up—please pick another time.");
}

export async function getCapacityForLocation(locationId: string) {
  const rule = await prisma.capacityRule.findUnique({ where: { locationId } });
  return rule?.maxBookingsPerSlot || DEFAULT_CAPACITY;
}

export const ACTIVE_BOOKING_STATUSES = ACTIVE_STATUSES;
