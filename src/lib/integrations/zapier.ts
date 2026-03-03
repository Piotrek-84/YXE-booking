import { createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";

export type BookingZapierEventType =
  | "BOOKING_CREATED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_COMPLETED"
  | "BOOKING_CANCELLED";

type BookingLike = {
  id: string;
  status?: string | null;
  updatedAt?: Date | string | null;
  startAt?: Date | string | null;
  bookingStartDateTime?: Date | string | null;
  requestedDate?: Date | string | null;
  requestedWindow?: string | null;
  location?: { code?: string | null; name?: string | null } | null;
  service?: { name?: string | null } | null;
  customer?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
  vehicle?: Record<string, unknown> | null;
  intakeAnswers?: unknown;
  address?: string | null;
};

function isIntegrationsEnabled() {
  const value = process.env.INTEGRATIONS_ENABLED || "";
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function signPayload(payload: string) {
  const secret = process.env.ZAPIER_WEBHOOK_SECRET || "";
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function isValidSignature(payload: string, signatureHeader?: string | null) {
  const secret = process.env.ZAPIER_WEBHOOK_SECRET || "";
  if (!secret) return false;
  if (!signatureHeader) return false;

  const normalized = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expected = signPayload(payload);
  const a = Buffer.from(normalized);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildEventPayload(eventType: BookingZapierEventType, booking: BookingLike) {
  return {
    eventType,
    bookingId: booking.id,
    bookingData: {
      bookingId: booking.id,
      status: booking.status || null,
      startAt: toIso(booking.startAt || booking.bookingStartDateTime || booking.requestedDate),
      requestedWindow: booking.requestedWindow || null,
      location: {
        code: booking.location?.code || null,
        name: booking.location?.name || null,
      },
      service: booking.service?.name || null,
      customer: {
        name: booking.customer?.fullName || null,
        email: booking.customer?.email || null,
        phone: booking.customer?.phone || null,
      },
      vehicle: booking.vehicle || null,
      address: booking.address || null,
      intakeAnswers: booking.intakeAnswers || null,
    },
  };
}

async function writeIntegrationFailureLog(params: {
  eventType: string;
  bookingId?: string;
  attempts: number;
  error: string;
  requestPayload: unknown;
  responsePayload?: unknown;
}) {
  const integrationLogClient = (prisma as any).integrationLog;
  if (!integrationLogClient) {
    console.error("Integration failure log unavailable (migration pending)", params);
    return;
  }
  await integrationLogClient.create({
    data: {
      provider: "ZAPIER",
      eventType: params.eventType,
      bookingId: params.bookingId || null,
      direction: "OUTBOUND",
      status: "FAILED",
      attempts: params.attempts,
      error: params.error,
      requestPayload: params.requestPayload,
      responsePayload: params.responsePayload || null,
    },
  });
}

export async function sendBookingEventToZapier(
  eventType: BookingZapierEventType,
  booking: BookingLike
) {
  if (!isIntegrationsEnabled()) return;
  const webhookUrl = process.env.ZAPIER_BOOKING_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = buildEventPayload(eventType, booking);
  const body = JSON.stringify(payload);
  const signature = signPayload(body);
  const updatedAtIso = toIso(booking.updatedAt) || "";
  const idempotencyKey = createHash("sha256")
    .update(`${booking.id}:${eventType}:${updatedAtIso}`)
    .digest("hex");

  let lastError = "Zapier request failed";
  let lastResponseBody: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Zapier-Signature": `sha256=${signature}`,
        },
        body,
      });

      if (response.ok) {
        return;
      }

      lastResponseBody = await response.text().catch(() => "");
      lastError = `Zapier webhook failed with ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Zapier network error";
    }

    if (attempt < 3) {
      const delayMs = 400 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  await writeIntegrationFailureLog({
    eventType,
    bookingId: booking.id,
    attempts: 3,
    error: lastError,
    requestPayload: payload,
    responsePayload: lastResponseBody,
  });
}

export async function writeIntegrationInboundLog(params: {
  eventType: string;
  bookingId?: string;
  payload: unknown;
  status?: string;
}) {
  const integrationLogClient = (prisma as any).integrationLog;
  if (!integrationLogClient) return;
  await integrationLogClient.create({
    data: {
      provider: "ZAPIER",
      eventType: params.eventType,
      bookingId: params.bookingId || null,
      direction: "INBOUND",
      status: params.status || "RECEIVED",
      attempts: 1,
      requestPayload: params.payload,
    },
  });
}
