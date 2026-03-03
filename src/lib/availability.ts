import {
  SLOT_CAPACITY,
  SLOT_WINDOW_DAYS,
  YXE_TIMEZONE,
  YXE_UTC_OFFSET,
  yxeSchedule,
} from "../../config/schedules";

type Slot = {
  start: string;
  label: string;
  slotKey: string;
};

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: YXE_TIMEZONE,
  });
}

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: YXE_TIMEZONE,
  });
}

function getYxeDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: YXE_TIMEZONE,
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

function getYxeDayOfWeek(date: Date) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: YXE_TIMEZONE,
    weekday: "short",
  }).format(date);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function buildSlotDateTime(date: Date, time: string) {
  const { year, month, day } = getYxeDateParts(date);
  return `${year}-${month}-${day}T${time}:00${YXE_UTC_OFFSET}`;
}

export function buildSlotKey(location: string, date: Date, time: string) {
  const { year, month, day } = getYxeDateParts(date);
  return `${location}-${year}-${month}-${day}-${time}`;
}

export function generateYxeSlots(startDate = new Date()) {
  const slots: Slot[] = [];
  const now = new Date(startDate);
  const today = new Date(startDate);
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= SLOT_WINDOW_DAYS; offset += 1) {
    const current = new Date(today);
    current.setDate(today.getDate() + offset);
    const dayIndex = getYxeDayOfWeek(current);
    const schedule = yxeSchedule.find((item) => item.day === dayIndex);
    if (!schedule) continue;

    schedule.slots.forEach((time) => {
      const start = buildSlotDateTime(current, time);
      const startDateTime = new Date(start);
      // Do not expose slots that are already in the past.
      if (startDateTime <= now) return;
      const label = `${formatDateLabel(current)} — ${formatTimeLabel(new Date(start))}`;
      const slotKey = buildSlotKey("YXE", current, time);
      slots.push({ start, label, slotKey });
    });
  }

  return slots;
}

export type AvailabilitySlot = {
  start: string;
  label: string;
  remainingCapacity: number;
  isAvailable: boolean;
};

export function applyCapacity(slots: Slot[], counts: Record<string, number>): AvailabilitySlot[] {
  return slots.map((slot) => {
    const used = counts[slot.slotKey] ?? 0;
    const remaining = Math.max(SLOT_CAPACITY - used, 0);
    return {
      start: slot.start,
      label: slot.label,
      remainingCapacity: remaining,
      isAvailable: remaining > 0,
    };
  });
}
