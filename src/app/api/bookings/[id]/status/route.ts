import { NextResponse } from "next/server";
import { z } from "zod";
import { sendBookingStatusEmail } from "../../../../../lib/email";
import { sendBookingEventToZapier } from "../../../../../lib/integrations/zapier";
import { sendBookingConfirmationNotifications } from "../../../../../lib/notifications";
import { prisma } from "../../../../../lib/prisma";

const statusSchema = z.object({
  status: z.enum([
    "REQUESTED",
    "CONFIRMED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELED",
    "NO_SHOW",
  ]),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      service: true,
      location: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: { status: parsed.data.status as any },
  });

  if (parsed.data.status !== existing.status) {
    const requestedDateLabel = existing.requestedDate.toLocaleDateString("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    try {
      await sendBookingStatusEmail({
        bookingId: existing.id,
        location: existing.location.code,
        serviceName: existing.service.name,
        requestedDate: requestedDateLabel,
        requestedWindow: existing.requestedWindow,
        customerName: existing.customer.fullName,
        customerEmail: existing.customer.email,
        status: parsed.data.status,
      });
    } catch (error) {
      console.error("Status email failed", error);
    }

    if (parsed.data.status === "CONFIRMED") {
      try {
        await sendBookingConfirmationNotifications({
          ...existing,
          status: parsed.data.status,
          updatedAt: new Date(),
        } as any);
      } catch (error) {
        console.error("Booking confirmed notifications failed", error);
      }
    }

    try {
      const eventType =
        parsed.data.status === "CONFIRMED"
          ? "BOOKING_CONFIRMED"
          : parsed.data.status === "COMPLETED"
            ? "BOOKING_COMPLETED"
            : parsed.data.status === "CANCELED"
              ? "BOOKING_CANCELLED"
              : null;
      if (eventType) {
        await sendBookingEventToZapier(eventType, {
          ...existing,
          status: parsed.data.status,
          updatedAt: new Date(),
        } as any);
      }
    } catch (error) {
      console.error("Zapier status event failed", error);
    }
  }

  return NextResponse.json({ id: booking.id, status: booking.status });
}
