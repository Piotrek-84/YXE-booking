import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const month = parsed.data.month ?? new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["NO_SHOW"] as any },
      requestedDate: { gte: start, lt: end },
    },
    include: {
      service: true,
      addOns: { include: { addOn: true } },
    },
  });

  let noShowCents = 0;

  bookings.forEach((booking) => {
    const bookingStatus = String(booking.status);
    const serviceCents = booking.service?.basePriceCents || 0;
    const addOnCents = booking.addOns.reduce((sum, item) => sum + (item.addOn?.priceCents || 0), 0);
    const total = serviceCents + addOnCents;
    if (bookingStatus === "NO_SHOW") noShowCents += total;
  });

  return NextResponse.json({
    month,
    totals: {
      noShowCount: bookings.filter((item) => String(item.status) === "NO_SHOW").length,
      noShowCents,
      totalLostCents: noShowCents,
    },
  });
}
