import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../lib/admin-auth";
import { writeBookingAudit } from "../../../../lib/audit";
import { getBlockedCustomerCapabilities } from "../../../../lib/blocked-customer-capabilities";
import { sendBookingStatusEmail } from "../../../../lib/email";
import { sendBookingEventToZapier } from "../../../../lib/integrations/zapier";
import { sendBookingConfirmationNotifications } from "../../../../lib/notifications";
import { normalizePhone } from "../../../../lib/phone";
import { prisma } from "../../../../lib/prisma";

const blockedCustomerClient = (prisma as any).blockedCustomer;
const historyStatusesForVisits = new Set([
  "REQUESTED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
]);

async function getBlockedCustomerForContact(phone: string, email?: string | null) {
  if (!blockedCustomerClient) return null;
  const { hasMaintenanceFields } = await getBlockedCustomerCapabilities();
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email?.toLowerCase() || null;
  const candidates = await blockedCustomerClient.findMany({
    where: {
      ...(hasMaintenanceFields
        ? {
            AND: [
              {
                OR: [{ isActive: true }, { isPotentialMaintenance: true }],
              },
              {
                OR: [
                  { phone: { contains: normalizedPhone.slice(-7) } },
                  ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
                ],
              },
            ],
          }
        : {
            isActive: true,
            OR: [
              { phone: { contains: normalizedPhone.slice(-7) } },
              ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ],
          }),
    },
    select: hasMaintenanceFields
      ? {
          id: true,
          phone: true,
          email: true,
          reason: true,
          clientFacingNote: true,
          isActive: true,
          isPotentialMaintenance: true,
          maintenanceReason: true,
          maintenanceMarkedAt: true,
          maintenanceMarkedBy: true,
        }
      : {
          id: true,
          phone: true,
          email: true,
          reason: true,
          clientFacingNote: true,
          isActive: true,
        },
  });
  return (
    candidates.find(
      (item: { phone: string; email?: string | null }) =>
        normalizePhone(item.phone) === normalizedPhone ||
        (normalizedEmail && item.email?.toLowerCase() === normalizedEmail)
    ) || null
  );
}

async function getBookingHistoryForContact(phone: string, email?: string | null) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email?.toLowerCase() || null;
  const last7 = normalizedPhone.slice(-7);

  const candidates = await prisma.booking.findMany({
    where: {
      OR: [
        { customer: { phone: { contains: last7 } } },
        ...(normalizedEmail ? [{ customer: { email: normalizedEmail } }] : []),
      ],
    },
    include: {
      service: true,
      location: true,
      vehicle: true,
    },
    orderBy: { requestedDate: "desc" },
    take: 200,
  });

  const items = candidates.filter((item) => {
    const itemPhone = normalizePhone(item.customerPhone || "");
    const emailValue = (item.customerEmail || "").toLowerCase();
    return itemPhone === normalizedPhone || (normalizedEmail && emailValue === normalizedEmail);
  });

  const now = new Date();
  const sortedAsc = [...items].sort(
    (a, b) =>
      new Date((a.bookingStartDateTime || a.requestedDate) as Date).getTime() -
      new Date((b.bookingStartDateTime || b.requestedDate) as Date).getTime()
  );
  const activeVisits = sortedAsc.filter((item) =>
    historyStatusesForVisits.has(String(item.status))
  );
  const pastVisits = activeVisits.filter(
    (item) => new Date((item.bookingStartDateTime || item.requestedDate) as Date) < now
  );
  const futureVisits = activeVisits.filter(
    (item) => new Date((item.bookingStartDateTime || item.requestedDate) as Date) >= now
  );

  return {
    totalVisits: activeVisits.length,
    lastVisit: pastVisits.length ? pastVisits[pastVisits.length - 1] : null,
    nextVisit: futureVisits.length ? futureVisits[0] : null,
    items: sortedAsc.map((item) => ({
      id: item.id,
      status: item.status,
      serviceName: item.service?.name || item.serviceName,
      locationName: item.location?.name,
      startAt: item.bookingStartDateTime || item.requestedDate,
      vehicle: {
        year: item.vehicle?.year,
        make: item.vehicle?.make,
        model: item.vehicle?.model,
      },
    })),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z
    .enum([
      "REQUESTED",
      "CONFIRMED",
      "SCHEDULED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELED",
      "NO_SHOW",
    ])
    .optional(),
  adminNotes: z.string().optional(),
  requestedDate: z.string().min(8).optional(),
  requestedWindow: z.string().min(2).optional(),
  bookingStartDateTime: z.string().min(8).optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      vehicle: true,
      service: true,
      addOns: { include: { addOn: true } },
      location: true,
      audits: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blockedCustomer = await getBlockedCustomerForContact(
    booking.customer.phone,
    booking.customer.email
  );
  const bookingHistory = await getBookingHistoryForContact(
    booking.customer.phone,
    booking.customer.email
  );

  return NextResponse.json({ booking: { ...booking, blockedCustomer, bookingHistory } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (
    !parsed.data.status &&
    parsed.data.adminNotes === undefined &&
    parsed.data.requestedDate === undefined &&
    parsed.data.requestedWindow === undefined &&
    parsed.data.bookingStartDateTime === undefined
  ) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
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

  const nextRequestedDate =
    parsed.data.requestedDate !== undefined ? new Date(parsed.data.requestedDate) : undefined;
  const nextBookingStart =
    parsed.data.bookingStartDateTime !== undefined
      ? new Date(parsed.data.bookingStartDateTime)
      : undefined;

  if (
    (nextRequestedDate && Number.isNaN(nextRequestedDate.getTime())) ||
    (nextBookingStart && Number.isNaN(nextBookingStart.getTime()))
  ) {
    return NextResponse.json({ error: "Invalid date/time" }, { status: 400 });
  }

  const booking = await prisma.booking.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status as any,
      adminNotes: parsed.data.adminNotes,
      requestedDate: nextRequestedDate,
      requestedWindow: parsed.data.requestedWindow,
      bookingStartDateTime: nextBookingStart,
    },
    include: {
      customer: true,
      vehicle: true,
      service: true,
      addOns: { include: { addOn: true } },
      location: true,
      audits: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  const actor =
    request.headers.get("x-admin-user") ||
    request.headers.get("x-admin-email") ||
    process.env.ADMIN_EMAIL ||
    "admin";
  const changes: Array<{ field: string; from: string | null; to: string | null }> = [];

  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    changes.push({
      field: "status",
      from: existing.status,
      to: parsed.data.status,
    });
  }
  if (
    parsed.data.adminNotes !== undefined &&
    parsed.data.adminNotes !== (existing.adminNotes ?? "")
  ) {
    changes.push({
      field: "adminNotes",
      from: existing.adminNotes ?? null,
      to: parsed.data.adminNotes || null,
    });
  }
  if (
    nextRequestedDate &&
    existing.requestedDate.toISOString() !== nextRequestedDate.toISOString()
  ) {
    changes.push({
      field: "requestedDate",
      from: existing.requestedDate.toISOString(),
      to: nextRequestedDate.toISOString(),
    });
  }
  if (
    parsed.data.requestedWindow !== undefined &&
    parsed.data.requestedWindow !== existing.requestedWindow
  ) {
    changes.push({
      field: "requestedWindow",
      from: existing.requestedWindow,
      to: parsed.data.requestedWindow,
    });
  }
  if (
    nextBookingStart &&
    (existing.bookingStartDateTime?.toISOString() ?? null) !== nextBookingStart.toISOString()
  ) {
    changes.push({
      field: "bookingStartDateTime",
      from: existing.bookingStartDateTime?.toISOString() ?? null,
      to: nextBookingStart.toISOString(),
    });
  }

  if (changes.length > 0) {
    await writeBookingAudit({
      bookingId: booking.id,
      action: "BOOKING_UPDATED",
      actor,
      details: {
        changes,
      },
    });
  }

  if (parsed.data.status && parsed.data.status !== existing.status) {
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
        await sendBookingConfirmationNotifications(booking as any);
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
        await sendBookingEventToZapier(eventType, booking as any);
      }
    } catch (error) {
      console.error("Zapier booking status event failed", error);
    }
  }

  const blockedCustomer = await getBlockedCustomerForContact(
    booking.customer.phone,
    booking.customer.email
  );
  const bookingHistory = await getBookingHistoryForContact(
    booking.customer.phone,
    booking.customer.email
  );

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    booking: {
      ...booking,
      blockedCustomer,
      bookingHistory,
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.booking.findUnique({
    where: { id: params.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.bookingAddOn.deleteMany({ where: { bookingId: params.id } }),
    prisma.booking.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
