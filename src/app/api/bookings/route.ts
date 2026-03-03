import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../lib/admin-auth";
import { writeBookingAudit } from "../../../lib/audit";
import {
  allocateSlotSequence,
  getCapacityForLocation,
  validateBookingRequest,
} from "../../../lib/availability-engine";
import { getBlockedCustomerCapabilities } from "../../../lib/blocked-customer-capabilities";
import { sendBookingCreatedEmails } from "../../../lib/email";
import { getAppBaseUrl } from "../../../lib/feature-flags";
import { sendBookingEventToZapier } from "../../../lib/integrations/zapier";
import { sendBookingConfirmationNotifications } from "../../../lib/notifications";
import { normalizePhone } from "../../../lib/phone";
import { prisma } from "../../../lib/prisma";
import { createClientManageToken, getTokenExpiry } from "../../../lib/tokens";

const blockedCustomerClient = (prisma as any).blockedCustomer;

function normalizeClientDeviceId(value?: string) {
  if (!value) return "";
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalized)) return "";
  return normalized;
}

function hashClientDeviceId(value?: string) {
  const normalized = normalizeClientDeviceId(value);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

const statusValues = [
  "REQUESTED",
  "CONFIRMED",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
  "NO_SHOW",
] as const;

const createSchema = z.object({
  locationCode: z.string().min(2),
  serviceId: z.string().min(3),
  serviceName: z.string().min(2).optional(),
  serviceDescription: z.string().optional(),
  servicePriceCents: z.number().int().nonnegative().optional(),
  serviceDurationMins: z.number().int().positive().optional(),
  addOnIds: z.array(z.string().min(3)).optional().default([]),
  addOnsDetailed: z
    .array(
      z.object({
        id: z.string().min(3).optional(),
        name: z.string().min(2),
        priceCents: z.number().int().nonnegative(),
        durationMins: z.number().int().positive(),
      })
    )
    .optional()
    .default([]),
  requestedDate: z.string().min(8).optional(),
  requestedWindow: z.string().min(2).optional(),
  bookingStart: z.string().min(8),
  slotLabel: z.string().optional(),
  vehicleSize: z.enum(["car", "suv", "truck", "large_suv", "minivan"]).optional(),
  intakeAnswers: z.record(z.any()).optional(),
  customer: z.object({
    fullName: z.string().min(2),
    phone: z.string().min(7),
    email: z.string().trim().email(),
  }),
  vehicle: z.object({
    year: z.number().int().min(1980).max(2050).optional(),
    make: z.string().min(2),
    model: z.string().min(1),
    trim: z.string().optional(),
    color: z.string().optional(),
    plate: z.string().optional(),
  }),
  clientDeviceId: z.string().min(16).max(128).optional(),
  notes: z.string().optional(),
});

const listSchema = z.object({
  location: z.string().optional(),
  status: z.enum(statusValues).optional(),
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

async function resolveLocation(code: string) {
  const existing = await prisma.location.findUnique({ where: { code } });
  if (existing) return existing;

  if (code !== "YXE" && code !== "YYC") return null;

  return prisma.location.create({
    data: {
      code,
      name: code === "YXE" ? "Saskatoon (YXE)" : "Calgary (YYC)",
    },
  });
}

async function resolveService(data: z.infer<typeof createSchema>, locationId: string) {
  let service = await prisma.service.findFirst({
    where: {
      id: data.serviceId,
      locationId,
      active: true,
    },
  });

  if (!service && data.serviceName) {
    service = await prisma.service.findFirst({
      where: {
        name: data.serviceName,
        locationId,
        active: true,
      },
    });
  }

  if (!service && data.serviceName) {
    service = await prisma.service.create({
      data: {
        locationId,
        name: data.serviceName,
        description: data.serviceDescription || "",
        basePriceCents: data.servicePriceCents || 0,
        durationMinutes: data.serviceDurationMins || 60,
        bufferMinutes: 0,
        active: true,
      },
    });
  }

  return service;
}

async function resolveAddOnIds(data: z.infer<typeof createSchema>, locationId: string) {
  let addOnIds = data.addOnIds;

  if (data.addOnsDetailed.length > 0) {
    const resolvedAddOns = await Promise.all(
      data.addOnsDetailed.map(async (addon) => {
        if (addon.id) {
          const existing = await prisma.addOn.findFirst({
            where: { id: addon.id, locationId },
          });
          if (existing) return existing;
        }
        const byName = await prisma.addOn.findFirst({
          where: { name: addon.name, locationId },
        });
        if (byName) return byName;
        return prisma.addOn.create({
          data: {
            locationId,
            name: addon.name,
            description: "",
            priceCents: addon.priceCents,
            durationMinutes: addon.durationMins,
            active: true,
          },
        });
      })
    );
    addOnIds = resolvedAddOns.map((item) => item.id);
  }

  return addOnIds;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const blockedCustomerClient = (prisma as any).blockedCustomer;
  const normalizedPhone = normalizePhone(data.customer.phone);
  if (normalizedPhone.length < 7) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  const normalizedEmail = data.customer.email.trim().toLowerCase();
  const { hasDeviceBlocking } = await getBlockedCustomerCapabilities();
  const blockedDeviceClient = hasDeviceBlocking ? (prisma as any).blockedDevice : null;
  const clientDeviceHash = hasDeviceBlocking ? hashClientDeviceId(data.clientDeviceId) : null;

  if (blockedDeviceClient && clientDeviceHash) {
    const blockedDevice = await blockedDeviceClient.findFirst({
      where: {
        deviceHash: clientDeviceHash,
        isActive: true,
      },
    });
    if (blockedDevice) {
      return NextResponse.json(
        {
          error: "Online booking is unavailable for this device. Please contact the shop directly.",
        },
        { status: 403 }
      );
    }
  }

  if (blockedCustomerClient) {
    const candidates = await blockedCustomerClient.findMany({
      where: {
        isActive: true,
        OR: [{ phone: { contains: normalizedPhone.slice(-7) } }, { email: normalizedEmail }],
      },
    });
    const blocked =
      candidates.find(
        (item: { phone: string; email?: string | null }) =>
          normalizePhone(item.phone) === normalizedPhone ||
          item.email?.toLowerCase() === normalizedEmail
      ) || null;
    if (blocked) {
      return NextResponse.json(
        {
          error: blocked.clientFacingNote
            ? `Online booking is unavailable for this account. ${blocked.clientFacingNote}`
            : "Online booking is unavailable for this account. Please contact the shop directly.",
        },
        { status: 403 }
      );
    }
  }

  const location = await resolveLocation(data.locationCode);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const service = await resolveService(data, location.id);
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const bookingStartDate = new Date(data.bookingStart);

  let selectedSlot;
  try {
    selectedSlot = await validateBookingRequest({
      locationCode: data.locationCode,
      serviceId: service.id,
      startAt: bookingStartDate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Selected time is not available.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const addOnIds = await resolveAddOnIds(data, location.id);
  const capacity = await getCapacityForLocation(location.id);

  const actor = process.env.ADMIN_EMAIL || "system";

  const createWithRetry = async (
    attempt = 1
  ): Promise<
    Prisma.BookingGetPayload<{
      include: {
        addOns: { include: { addOn: true } };
        customer: true;
        vehicle: true;
        service: true;
        location: true;
      };
    }>
  > => {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const slotSequence = await allocateSlotSequence({
          tx,
          locationId: location.id,
          slotKey: selectedSlot.slotKey,
          startAt: bookingStartDate,
          maxPerSlot: capacity,
        });

        const customer = await tx.customer.create({
          data: {
            fullName: data.customer.fullName,
            phone: normalizedPhone,
            email: normalizedEmail,
            notes: data.notes || null,
          },
        });

        const vehicle = await tx.vehicle.create({
          data: {
            customerId: customer.id,
            size: data.vehicleSize,
            year: data.vehicle.year,
            make: data.vehicle.make,
            model: data.vehicle.model,
            trim: data.vehicle.trim || null,
            color: data.vehicle.color || null,
            plate: data.vehicle.plate || null,
          },
        });

        const manageToken = createClientManageToken();
        const tokenExpiresAt = getTokenExpiry(30);
        const endAt = new Date(selectedSlot.endAt);

        const booking = await tx.booking.create({
          data: {
            locationId: location.id,
            customerId: customer.id,
            vehicleId: vehicle.id,
            serviceId: service.id,
            customerName: customer.fullName,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            bufferMinutes: service.bufferMinutes,
            intakeAnswers: data.intakeAnswers,
            clientManageToken: manageToken,
            tokenExpiresAt,
            updatedBy: actor,
            status: "CONFIRMED",
            ...(clientDeviceHash ? { clientDeviceHash } : {}),
            bookingStartDateTime: bookingStartDate,
            startAt: bookingStartDate,
            endAt,
            slotKey: selectedSlot.slotKey,
            slotSequence,
            requestedDate: data.requestedDate ? new Date(data.requestedDate) : bookingStartDate,
            requestedWindow: data.requestedWindow || selectedSlot.label,
            customerNotes: data.notes || null,
            addOns: {
              createMany: {
                data: addOnIds.map((addOnId) => ({ addOnId })),
              },
            },
          },
          include: {
            addOns: { include: { addOn: true } },
            customer: true,
            vehicle: true,
            service: true,
            location: true,
          },
        });

        await tx.bookingAudit.create({
          data: {
            bookingId: booking.id,
            action: "BOOKING_CREATED",
            actor,
            details: {
              startAt: booking.startAt,
              status: booking.status,
              slotKey: booking.slotKey,
              slotSequence: booking.slotSequence,
            },
          },
        });

        return booking;
      });

      return booking;
    } catch (error) {
      if (
        attempt < 4 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return createWithRetry(attempt + 1);
      }
      throw error;
    }
  };

  let booking;
  try {
    booking = await createWithRetry();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create booking.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const addOnNames = booking.addOns.map((item) => item.addOn.name);

  const requestedDateLabel = bookingStartDate.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  try {
    await sendBookingCreatedEmails({
      bookingId: booking.id,
      location: location.code,
      serviceName: service.name,
      requestedDate: requestedDateLabel,
      requestedWindow: data.requestedWindow || selectedSlot.label,
      customerName: booking.customer.fullName,
      customerPhone: booking.customer.phone,
      customerEmail: booking.customer.email,
      addOns: addOnNames,
      manageUrl: `${getAppBaseUrl()}/manage/${booking.clientManageToken}`,
    });
  } catch (error) {
    console.error("Booking email failed", error);
  }

  try {
    await sendBookingConfirmationNotifications(booking as any);
  } catch (error) {
    console.error("Booking confirmation notifications failed", error);
  }

  try {
    await sendBookingEventToZapier("BOOKING_CREATED", booking as any);
  } catch (error) {
    console.error("Zapier booking create failed", error);
  }

  return NextResponse.json({
    id: booking.id,
    status: booking.status,
    manageUrl: `${getAppBaseUrl()}/manage/${booking.clientManageToken}`,
  });
}

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    location: searchParams.get("location") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    date: searchParams.get("date") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { location, status, date, dateFrom, dateTo, search, page = 1, pageSize = 50 } = parsed.data;
  const searchTerm = search?.trim();

  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (dateFrom || dateTo) {
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : new Date("1970-01-01T00:00:00");
    const end = dateTo ? new Date(`${dateTo}T00:00:00`) : new Date("2100-01-01T00:00:00");
    end.setDate(end.getDate() + 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    dateFilter = { gte: start, lt: end };
  } else if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    dateFilter = { gte: start, lt: end };
  }

  const where: Prisma.BookingWhereInput = {
    status: status ? (status as any) : undefined,
    requestedDate: dateFilter,
    location: location ? { code: location } : undefined,
    ...(searchTerm
      ? {
          OR: [
            { customer: { fullName: { contains: searchTerm } } },
            { customer: { phone: { contains: searchTerm } } },
            { customer: { email: { contains: searchTerm } } },
            { vehicle: { make: { contains: searchTerm } } },
            { vehicle: { model: { contains: searchTerm } } },
            { vehicle: { plate: { contains: searchTerm } } },
            { service: { name: { contains: searchTerm } } },
          ],
        }
      : {}),
  };

  const [bookings, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      orderBy: { requestedDate: "asc" },
      include: {
        customer: true,
        vehicle: true,
        service: true,
        addOns: { include: { addOn: true } },
        location: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  let blockedCustomers: Array<{
    id: string;
    phone: string;
    email?: string | null;
    reason?: string | null;
    clientFacingNote?: string | null;
    isActive: boolean;
    isPotentialMaintenance?: boolean;
    maintenanceReason?: string | null;
    maintenanceMarkedAt?: Date | null;
    maintenanceMarkedBy?: string | null;
  }> = [];

  if (blockedCustomerClient && bookings.length > 0) {
    const { hasMaintenanceFields } = await getBlockedCustomerCapabilities();
    const phones = Array.from(
      new Set(bookings.map((item) => normalizePhone(item.customer.phone)).filter(Boolean))
    );
    const emails = Array.from(
      new Set(
        bookings
          .map((item) => item.customer.email?.toLowerCase().trim())
          .filter((value): value is string => Boolean(value))
      )
    );

    blockedCustomers = await blockedCustomerClient.findMany({
      where: {
        ...(hasMaintenanceFields
          ? {
              AND: [
                {
                  OR: [{ isActive: true }, { isPotentialMaintenance: true }],
                },
                {
                  OR: [{ phone: { in: phones } }, { email: { in: emails } }],
                },
              ],
            }
          : {
              isActive: true,
              OR: [{ phone: { in: phones } }, { email: { in: emails } }],
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
  }

  const blockedByPhone = new Map(
    blockedCustomers.map((item) => [normalizePhone(item.phone), item])
  );
  const blockedByEmail = new Map(
    blockedCustomers
      .filter((item) => item.email)
      .map((item) => [String(item.email).toLowerCase(), item])
  );

  const bookingsWithBlocked = bookings.map((booking) => {
    const byPhone = blockedByPhone.get(normalizePhone(booking.customer.phone));
    const byEmail = booking.customer.email
      ? blockedByEmail.get(booking.customer.email.toLowerCase())
      : undefined;
    return {
      ...booking,
      blockedCustomer: byPhone || byEmail || null,
    };
  });

  return NextResponse.json({
    bookings: bookingsWithBlocked,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
