import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { isAdminAuthorized } from "../../../../lib/admin-auth";

const bulkStatusSchema = z.object({
  bookingIds: z.array(z.string().min(3)).min(1).max(200),
  status: z.enum([
    "REQUESTED",
    "CONFIRMED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELED",
    "NO_SHOW"
  ])
});

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bulkStatusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { bookingIds, status } = parsed.data;
  const actor =
    request.headers.get("x-admin-user") ||
    request.headers.get("x-admin-email") ||
    process.env.ADMIN_EMAIL ||
    "admin";

  const result = await prisma.$transaction(async (tx) => {
    const existingBookings = await tx.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { id: true, status: true }
    });

    if (existingBookings.length === 0) {
      return { updatedCount: 0, updatedIds: [] as string[] };
    }

    const updatedIds = existingBookings.map((booking) => booking.id);

    await tx.booking.updateMany({
      where: { id: { in: updatedIds } },
      data: { status: status as any }
    });

    await tx.bookingAudit.createMany({
      data: existingBookings.map((booking) => ({
        bookingId: booking.id,
        action: "BOOKING_BULK_STATUS_UPDATED",
        actor,
        details: {
          changes: [
            {
              field: "status",
              from: booking.status,
              to: status
            }
          ]
        }
      }))
    });

    return { updatedCount: updatedIds.length, updatedIds };
  });

  return NextResponse.json(result);
}
