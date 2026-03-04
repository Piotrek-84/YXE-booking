import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../../lib/admin-auth";
import { sendEmployeeScheduleEmail } from "../../../../../lib/email";
import { getAppBaseUrl } from "../../../../../lib/feature-flags";
import { prisma } from "../../../../../lib/prisma";
import { createScheduleRequestToken } from "../../../../../lib/schedule";

const publishSchema = z.object({
  locationCode: z.string().min(2).max(12),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string().min(3)).optional(),
});

function parseDate(value: string, endOfDay = false) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const from = parseDate(parsed.data.dateFrom);
  const to = parseDate(parsed.data.dateTo, true);
  if (!from || !to || to < from) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const shifts = await prisma.employeeShift.findMany({
    where: {
      locationCode: parsed.data.locationCode,
      shiftDate: {
        gte: from,
        lte: to,
      },
      ...(parsed.data.employeeIds?.length ? { employeeId: { in: parsed.data.employeeIds } } : {}),
      employee: {
        isActive: true,
      },
    },
    include: {
      employee: true,
    },
    orderBy: [{ shiftDate: "asc" }, { startTime: "asc" }],
  });

  const grouped = new Map<string, typeof shifts>();
  for (const shift of shifts) {
    const list = grouped.get(shift.employeeId) || [];
    list.push(shift);
    grouped.set(shift.employeeId, list);
  }

  if (grouped.size === 0) {
    return NextResponse.json({ error: "No scheduled employees in this range." }, { status: 400 });
  }

  const periodLabel = `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
  const appBaseUrl = getAppBaseUrl();
  const sent: string[] = [];
  const failed: Array<{ employeeId: string; employeeName: string; reason: string }> = [];

  for (const [employeeId, employeeShifts] of grouped.entries()) {
    const employee = employeeShifts[0]?.employee;
    if (!employee?.email) continue;

    try {
      const token = createScheduleRequestToken();
      await prisma.scheduleEmailLog.create({
        data: {
          employeeId,
          locationCode: parsed.data.locationCode,
          periodStart: from,
          periodEnd: to,
          requestToken: token,
          sentBy: process.env.ADMIN_EMAIL || "admin",
        },
      });

      const requestUrl = `${appBaseUrl}/schedule/request?token=${encodeURIComponent(token)}`;
      await sendEmployeeScheduleEmail({
        employeeName: employee.fullName,
        employeeEmail: employee.email,
        locationCode: parsed.data.locationCode,
        periodLabel,
        shifts: employeeShifts.map((shift) => ({
          dateLabel: formatDateLabel(shift.shiftDate),
          startTime: shift.startTime,
          endTime: shift.endTime,
        })),
        requestUrl,
      });
      sent.push(employee.fullName);
    } catch (error) {
      failed.push({
        employeeId,
        employeeName: employee.fullName,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed,
  });
}
