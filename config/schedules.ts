export const YXE_TIMEZONE = "America/Regina";

export type DailySchedule = {
  day: number; // 0=Sunday..6=Saturday
  slots: string[]; // "HH:MM" 24h
};

export const yxeSchedule: DailySchedule[] = [
  { day: 0, slots: ["11:00", "13:00", "15:30"] },
  { day: 1, slots: ["09:00", "11:00", "13:30", "15:30"] },
  { day: 2, slots: ["09:00", "11:00", "13:30", "15:30"] },
  { day: 3, slots: ["09:00", "11:00", "13:30", "15:30"] },
  { day: 4, slots: ["09:00", "11:00", "13:30", "15:30"] },
  { day: 5, slots: ["09:00", "11:00", "13:30", "15:30"] },
  { day: 6, slots: ["09:00", "11:00", "13:30", "15:30"] },
];

export const SLOT_CAPACITY = 4;
export const SLOT_WINDOW_DAYS = 21;
export const YXE_UTC_OFFSET = "-06:00";
