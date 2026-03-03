import { BookingStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeBookingAudit } from "../../../../lib/audit";
import {
  allocateSlotSequence,
  getCapacityForLocation,
  validateBookingRequest,
} from "../../../../lib/availability-engine";
import { sendBookingCreatedEmails, sendBookingStatusEmail } from "../../../../lib/email";
import { getAppBaseUrl } from "../../../../lib/feature-flags";
import { sendBookingEventToZapier } from "../../../../lib/integrations/zapier";
import { sendBookingConfirmationNotifications } from "../../../../lib/notifications";
import { prisma } from "../../../../lib/prisma";
import { createClientManageToken, getTokenExpiry } from "../../../../lib/tokens";

const manageSchema = z.object({
  action: z.enum(["cancel", "reschedule"]),
  newStartAt: z.string().optional(),
});

function getCutoffHours(kind: "cancel" | "reschedule") {
  const raw =
    kind === "cancel"
      ? process.env.MANAGE_CANCEL_CUTOFF_HOURS
      : process.env.MANAGE_RESCHEDULE_CUTOFF_HOURS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 2;
}

function isPastCutoff(startAt: Date, cutoffHours: number) {
  const cutoff = new Date(startAt.getTime() - cutoffHours * 60 * 60 * 1000);
  return new Date() >= cutoff;
}

async function findManageBooking(token: string) {
  const booking = await prisma.booking.findFirst({
    where: {
      clientManageToken: token,
      tokenExpiresAt: { gt: new Date() },
    },
    include: {
      customer: true,
      vehicle: true,
      service: true,
      location: true,
      addOns: { include: { addOn: true } },
    },
  });
  return booking;
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const booking = await findManageBooking(params.token);

  if (!booking) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      location: booking.location,
      service: booking.service,
      customer: booking.customer,
      vehicle: booking.vehicle,
      startAt: booking.startAt,
      endAt: booking.endAt,
      requestedDate: booking.requestedDate,
      requestedWindow: booking.requestedWindow,
      tokenExpiresAt: booking.tokenExpiresAt,
      addOns: booking.addOns.map((item) => ({
        name: item.addOn.name,
        priceCents: item.addOn.priceCents,
      })),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: { token: string } }) {
  const booking = await findManageBooking(params.token);

  if (!booking) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "cancel") {
    const cutoffHours = getCutoffHours("cancel");
    const startAt = booking.startAt || booking.bookingStartDateTime || booking.requestedDate;
    if (isPastCutoff(startAt, cutoffHours)) {
      return NextResponse.json(
        { error: `This booking can no longer be canceled online within ${cutoffHours} hours.` },
        { status: 400 }
      );
    }

    const nextToken = createClientManageToken();

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        updatedBy: "client:self-service",
        clientManageToken: nextToken,
        tokenExpiresAt: getTokenExpiry(30),
      },
      include: {
        customer: true,
        service: true,
        location: true,
      },
    });

    await writeBookingAudit({
      bookingId: booking.id,
      action: "CLIENT_CANCELED",
      actor: booking.customer.email || booking.customer.phone,
      details: {
        previousStatus: booking.status,
        nextStatus: "CANCELED",
      },
    });

    try {
      await sendBookingStatusEmail({
        bookingId: updated.id,
        location: updated.location.code,
        serviceName: updated.service.name,
        requestedDate: updated.requestedDate.toLocaleDateString("en-CA", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        requestedWindow: updated.requestedWindow,
        customerName: updated.customer.fullName,
        customerEmail: updated.customer.email,
        status: "CANCELED",
      });
    } catch (error) {
      console.error("Cancel status email failed", error);
    }

    try {
      await sendBookingEventToZapier("BOOKING_CANCELLED", updated as any);
    } catch (error) {
      console.error("Zapier cancel event failed", error);
    }

    return NextResponse.json({
      ok: true,
      status: "CANCELED",
      message: "Your booking has been canceled.",
    });
  }

  if (!parsed.data.newStartAt) {
    return NextResponse.json({ error: "newStartAt is required for reschedule." }, { status: 400 });
  }

  const cutoffHours = getCutoffHours("reschedule");
  const currentStartAt = booking.startAt || booking.bookingStartDateTime || booking.requestedDate;
  if (isPastCutoff(currentStartAt, cutoffHours)) {
    return NextResponse.json(
      { error: `This booking can no longer be rescheduled online within ${cutoffHours} hours.` },
      { status: 400 }
    );
  }

  const newStartAt = new Date(parsed.data.newStartAt);
  if (Number.isNaN(newStartAt.getTime())) {
    return NextResponse.json({ error: "Invalid new date/time." }, { status: 400 });
  }

  let selectedSlot;
  try {
    selectedSlot = await validateBookingRequest({
      locationCode: booking.location.code,
      serviceId: booking.serviceId,
      startAt: newStartAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Selected time is not available.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const capacity = await getCapacityForLocation(booking.locationId);

  const updateWithRetry = async (attempt = 1) => {
    try {
      return await prisma.$transaction(async (tx) => {
        const slotSequence = await allocateSlotSequence({
          tx,
          locationId: booking.locationId,
          slotKey: selectedSlot.slotKey,
          startAt: newStartAt,
          maxPerSlot: capacity,
        });

        const nextToken = createClientManageToken();
        const endAt = new Date(selectedSlot.endAt);

        const updated = await tx.booking.update({
          where: { id: booking.id },
          data: {
            startAt: newStartAt,
            endAt,
            bookingStartDateTime: newStartAt,
            requestedDate: newStartAt,
            requestedWindow: selectedSlot.label,
            slotKey: selectedSlot.slotKey,
            slotSequence,
            updatedBy: "client:self-service",
            clientManageToken: nextToken,
            tokenExpiresAt: getTokenExpiry(30),
            status: booking.status === "CANCELED" ? "CONFIRMED" : booking.status,
          },
          include: {
            customer: true,
            service: true,
            location: true,
            addOns: { include: { addOn: true } },
          },
        });

        await tx.bookingAudit.create({
          data: {
            bookingId: booking.id,
            action: "CLIENT_RESCHEDULED",
            actor: booking.customer.email || booking.customer.phone,
            details: {
              previousStartAt: currentStartAt,
              nextStartAt: newStartAt,
              slotKey: selectedSlot.slotKey,
            },
          },
        });

        return updated;
      });
    } catch (error) {
      if (
        attempt < 4 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return updateWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  const updated = await updateWithRetry();

  try {
    await sendBookingCreatedEmails({
      bookingId: updated.id,
      location: updated.location.code,
      serviceName: updated.service.name,
      requestedDate: updated.requestedDate.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      requestedWindow: updated.requestedWindow,
      customerName: updated.customer.fullName,
      customerPhone: updated.customer.phone,
      customerEmail: updated.customer.email,
      addOns: updated.addOns.map((item) => item.addOn.name),
      manageUrl: `${getAppBaseUrl()}/manage/${updated.clientManageToken}`,
    });
  } catch (error) {
    console.error("Reschedule email failed", error);
  }

  if (updated.status === "CONFIRMED") {
    try {
      await sendBookingConfirmationNotifications(updated as any);
    } catch (error) {
      console.error("Booking confirmation notifications failed", error);
    }
    try {
      await sendBookingEventToZapier("BOOKING_CONFIRMED", updated as any);
    } catch (error) {
      console.error("Zapier confirmed event failed", error);
    }
  }

  return NextResponse.json({
    ok: true,
    status: updated.status,
    message: "Your booking has been rescheduled.",
    booking: {
      id: updated.id,
      startAt: updated.startAt,
      requestedWindow: updated.requestedWindow,
      status: updated.status,
    },
  });
}
