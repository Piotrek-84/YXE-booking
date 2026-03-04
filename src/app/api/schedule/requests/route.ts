import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { isValidTimeValue, toTimeMinutes } from "../../../../lib/schedule";

const requestTypeValues = ["DAY_OFF", "SHIFT_CHANGE", "OTHER"] as const;

const tokenSchema = z.object({
  token: z.string().min(8),
});

const createSchema = z.object({
  token: z.string().min(8),
  requestType: z.enum(requestTypeValues),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  requestedStartTime: z.string().optional(),
  requestedEndTime: z.string().optional(),
  reason: z.string().trim().min(8).max(1200),
});

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = tokenSchema.safeParse({
    token: searchParams.get("token") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request token." }, { status: 400 });
  }

  const log = await prisma.scheduleEmailLog.findUnique({
    where: { requestToken: parsed.data.token },
    include: {
      employee: true,
    },
  });
  if (!log) {
    return NextResponse.json({ error: "Request token not found." }, { status: 404 });
  }

  return NextResponse.json({
    employee: {
      id: log.employee.id,
      fullName: log.employee.fullName,
      email: log.employee.email,
    },
    locationCode: log.locationCode,
    periodStart: log.periodStart,
    periodEnd: log.periodEnd,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const log = await prisma.scheduleEmailLog.findUnique({
    where: { requestToken: parsed.data.token },
    include: {
      employee: true,
    },
  });
  if (!log) {
    return NextResponse.json({ error: "Request token not found." }, { status: 404 });
  }

  const requestedDate = parseDate(parsed.data.requestedDate);
  if (parsed.data.requestedDate && !requestedDate) {
    return NextResponse.json({ error: "Invalid requested date." }, { status: 400 });
  }

  const requestedStartTime = parsed.data.requestedStartTime?.trim() || null;
  const requestedEndTime = parsed.data.requestedEndTime?.trim() || null;
  if (requestedStartTime && !isValidTimeValue(requestedStartTime)) {
    return NextResponse.json({ error: "Start time must be HH:MM." }, { status: 400 });
  }
  if (requestedEndTime && !isValidTimeValue(requestedEndTime)) {
    return NextResponse.json({ error: "End time must be HH:MM." }, { status: 400 });
  }
  if (requestedStartTime && requestedEndTime) {
    const startMinutes = toTimeMinutes(requestedStartTime);
    const endMinutes = toTimeMinutes(requestedEndTime);
    if (
      !Number.isFinite(startMinutes) ||
      !Number.isFinite(endMinutes) ||
      endMinutes <= startMinutes
    ) {
      return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    }
  }

  const requestRecord = await prisma.scheduleChangeRequest.create({
    data: {
      employeeId: log.employeeId,
      locationCode: log.locationCode,
      scheduleEmailLogId: log.id,
      requestType: parsed.data.requestType,
      requestedDate,
      requestedStartTime,
      requestedEndTime,
      reason: parsed.data.reason,
      status: "PENDING",
    },
  });

  return NextResponse.json({ request: requestRecord }, { status: 201 });
}
