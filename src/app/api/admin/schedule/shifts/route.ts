import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import {
  isValidTimeValue,
  syncStaffingForShiftDates,
  toTimeMinutes,
} from "../../../../../lib/schedule";

const listSchema = z.object({
  locationCode: z.string().min(2).max(12),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().min(3).optional(),
});

const createSchema = z.object({
  employeeId: z.string().min(3),
  locationCode: z.string().min(2).max(12),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().min(5).max(5).optional(),
  endTime: z.string().min(5).max(5).optional(),
  isDayOff: z.boolean().optional(),
  notes: z.string().max(250).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(3),
});

const removeSchema = z.object({
  id: z.string().min(3),
});

const scheduleRepairStatements = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "scheduleName" TEXT`,
  `ALTER TABLE "EmployeeShift" ADD COLUMN IF NOT EXISTS "isDayOff" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "SlotBlock" ADD COLUMN IF NOT EXISTS "isAutoStaffBlock" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "SlotBlock_locationId_isAutoStaffBlock_startAt_idx"
    ON "SlotBlock"("locationId", "isAutoStaffBlock", "startAt")`,
];

function isMissingScheduleSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function parseShiftDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unknown error";
}

async function repairScheduleSchema() {
  for (const statement of scheduleRepairStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function retryWithScheduleRepair<T>(operation: () => Promise<T>) {
  try {
    return { value: await operation(), repaired: false };
  } catch (error) {
    if (!isMissingScheduleSchemaError(error)) {
      throw error;
    }
  }

  await repairScheduleSchema();
  return { value: await operation(), repaired: true };
}

async function syncStaffingSafe(entries: Array<{ locationCode: string; shiftDate: Date }>) {
  const syncPromise = syncStaffingForShiftDates(entries)
    .then(() => ({ ok: true as const }))
    .catch((error) => ({
      ok: false as const,
      message: formatUnknownError(error),
    }));

  const timeoutPromise = new Promise<{ ok: false; timeout: true }>((resolve) => {
    setTimeout(() => resolve({ ok: false, timeout: true }), 4000);
  });

  const result = await Promise.race([syncPromise, timeoutPromise]);
  if ("timeout" in result) {
    void syncPromise.then((finalResult) => {
      if (!finalResult.ok) {
        console.error("[schedule] delayed staffing sync failed:", finalResult.message);
      }
    });
    return "Shift saved. Automatic lane sync is still processing in background.";
  }

  if (!result.ok) {
    console.error("[schedule] staffing sync failed:", result.message);
    return "Shift saved, but automatic lane sync failed. Please run setup/migrations for schedule tables.";
  }

  return "";
}

function validateShiftTimes(startTime: string, endTime: string) {
  if (!isValidTimeValue(startTime) || !isValidTimeValue(endTime)) {
    return "Time must be in HH:MM format.";
  }
  const startMinutes = toTimeMinutes(startTime);
  const endMinutes = toTimeMinutes(endTime);
  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    endMinutes <= startMinutes
  ) {
    return "Shift end time must be after start time.";
  }
  return "";
}

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    locationCode: searchParams.get("locationCode") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    employeeId: searchParams.get("employeeId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const from = parseShiftDate(parsed.data.dateFrom);
  const to = parseShiftDate(parsed.data.dateTo);
  if (!from || !to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  to.setUTCHours(23, 59, 59, 999);

  let shifts;
  try {
    const { value } = await retryWithScheduleRepair(() =>
      prisma.employeeShift.findMany({
        where: {
          locationCode: parsed.data.locationCode,
          shiftDate: {
            gte: from,
            lte: to,
          },
          ...(parsed.data.employeeId ? { employeeId: parsed.data.employeeId } : {}),
        },
        include: {
          employee: true,
        },
        orderBy: [{ shiftDate: "asc" }, { startTime: "asc" }, { employee: { fullName: "asc" } }],
      })
    );
    shifts = value;
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not load shifts." }, { status: 500 });
  }

  return NextResponse.json({ shifts });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const date = parseShiftDate(parsed.data.shiftDate);
  if (!date) {
    return NextResponse.json({ error: "Invalid shift date." }, { status: 400 });
  }

  const isDayOff = parsed.data.isDayOff ?? false;
  const normalizedStartTime = isDayOff ? "00:00" : (parsed.data.startTime ?? "09:00");
  const normalizedEndTime = isDayOff ? "23:59" : (parsed.data.endTime ?? "17:00");

  if (!isDayOff) {
    const timeError = validateShiftTimes(normalizedStartTime, normalizedEndTime);
    if (timeError) {
      return NextResponse.json({ error: timeError }, { status: 400 });
    }
  }

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  try {
    const { value: shift, repaired } = await retryWithScheduleRepair(() =>
      prisma.employeeShift.create({
        data: {
          employeeId: parsed.data.employeeId,
          locationCode: parsed.data.locationCode,
          shiftDate: date,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          isDayOff,
          notes: parsed.data.notes || null,
          createdBy: process.env.ADMIN_EMAIL || "admin",
        },
        include: { employee: true },
      })
    );

    const syncWarning = await syncStaffingSafe([
      {
        locationCode: shift.locationCode,
        shiftDate: shift.shiftDate,
      },
    ]);
    const warningText = [repaired ? "Schedule schema was repaired automatically." : "", syncWarning]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json(
      { shift, ...(warningText ? { warning: warningText } : {}) },
      { status: 201 }
    );
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingShift = await prisma.employeeShift.findFirst({
        where: {
          employeeId: parsed.data.employeeId,
          locationCode: parsed.data.locationCode,
          shiftDate: date,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
        },
        include: { employee: true },
      });
      return NextResponse.json({
        shift: existingShift,
        warning: "That exact shift already exists.",
      });
    }
    return NextResponse.json(
      { error: `Unable to create shift. ${formatUnknownError(error)}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let existing;
  let repairedInLookup = false;
  try {
    const lookup = await retryWithScheduleRepair(() =>
      prisma.employeeShift.findUnique({
        where: { id: parsed.data.id },
      })
    );
    existing = lookup.value;
    repairedInLookup = lookup.repaired;
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Unable to load shift. ${formatUnknownError(error)}` },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }

  const nextShiftDate = parsed.data.shiftDate ?? existing.shiftDate.toISOString().slice(0, 10);
  const nextIsDayOff = parsed.data.isDayOff ?? existing.isDayOff;
  const nextStartTime = nextIsDayOff ? "00:00" : (parsed.data.startTime ?? existing.startTime);
  const nextEndTime = nextIsDayOff ? "23:59" : (parsed.data.endTime ?? existing.endTime);
  const shiftDate = parseShiftDate(nextShiftDate);
  if (!shiftDate) {
    return NextResponse.json({ error: "Invalid shift date." }, { status: 400 });
  }

  if (!nextIsDayOff) {
    const timeError = validateShiftTimes(nextStartTime, nextEndTime);
    if (timeError) {
      return NextResponse.json({ error: timeError }, { status: 400 });
    }
  }

  if (parsed.data.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }
  }

  try {
    const { value: shift, repaired } = await retryWithScheduleRepair(() =>
      prisma.employeeShift.update({
        where: { id: parsed.data.id },
        data: {
          ...(parsed.data.employeeId ? { employeeId: parsed.data.employeeId } : {}),
          ...(parsed.data.locationCode ? { locationCode: parsed.data.locationCode } : {}),
          shiftDate,
          startTime: nextStartTime,
          endTime: nextEndTime,
          isDayOff: nextIsDayOff,
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
        },
        include: { employee: true },
      })
    );

    const syncWarning = await syncStaffingSafe([
      {
        locationCode: existing.locationCode,
        shiftDate: existing.shiftDate,
      },
      {
        locationCode: shift.locationCode,
        shiftDate: shift.shiftDate,
      },
    ]);
    const warningText = [
      repairedInLookup || repaired ? "Schedule schema was repaired automatically." : "",
      syncWarning,
    ]
      .filter(Boolean)
      .join(" ");

    return NextResponse.json({ shift, ...(warningText ? { warning: warningText } : {}) });
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That exact shift already exists." }, { status: 409 });
    }
    return NextResponse.json(
      { error: `Unable to update shift. ${formatUnknownError(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = removeSchema.safeParse({
    id: searchParams.get("id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let existing;
  let repairedInLookup = false;
  try {
    const lookup = await retryWithScheduleRepair(() =>
      prisma.employeeShift.findUnique({
        where: { id: parsed.data.id },
      })
    );
    existing = lookup.value;
    repairedInLookup = lookup.repaired;
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Unable to load shift. ${formatUnknownError(error)}` },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  }

  try {
    const removed = await retryWithScheduleRepair(() =>
      prisma.employeeShift.delete({
        where: { id: parsed.data.id },
      })
    );
    const syncWarning = await syncStaffingSafe([
      {
        locationCode: existing.locationCode,
        shiftDate: existing.shiftDate,
      },
    ]);
    const warningText = [
      repairedInLookup || removed.repaired ? "Schedule schema was repaired automatically." : "",
      syncWarning,
    ]
      .filter(Boolean)
      .join(" ");
    return NextResponse.json({ ok: true, ...(warningText ? { warning: warningText } : {}) });
  } catch (error) {
    if (isMissingScheduleSchemaError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Unable to remove shift. ${formatUnknownError(error)}` },
      { status: 500 }
    );
  }
}
