import { createHash } from "crypto";
import { sendEmail } from "./email";
import { getAppBaseUrl, isFeatureEnabled } from "./feature-flags";
import { prisma } from "./prisma";
import { sendSms } from "./sms";

type BookingNotificationShape = {
  id: string;
  status: string;
  requestedDate: Date;
  requestedWindow: string;
  startAt?: Date | null;
  bookingStartDateTime?: Date | null;
  updatedAt?: Date | null;
  clientManageToken?: string | null;
  customer?: { fullName: string; email?: string | null; phone: string } | null;
  service?: { name: string } | null;
  location?: { code: string; name: string } | null;
};

const notificationLogClient = (prisma as any).notificationLog;
const timeZoneByLocation: Record<string, string> = {
  YXE: "America/Regina",
  YYC: "America/Edmonton",
};

function makeDedupeKey(parts: string[]) {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

function getManageUrl(token?: string | null) {
  if (!token) return "";
  return `${getAppBaseUrl()}/manage/${token}`;
}

async function hasSent(dedupeKey: string) {
  if (!notificationLogClient) return false;
  try {
    const existing = await notificationLogClient.findUnique({ where: { dedupeKey } });
    return existing?.status === "SENT";
  } catch (error) {
    console.error("Notification dedupe lookup failed; proceeding with send", error);
    return false;
  }
}

async function logNotification(params: {
  bookingId?: string;
  channel: "EMAIL" | "SMS";
  notificationType: string;
  dedupeKey: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  provider: string;
  toAddress?: string;
  payload?: unknown;
  error?: string;
  sendAt?: Date;
}) {
  if (!notificationLogClient) {
    if (params.status === "FAILED") {
      console.error("Notification failed (log unavailable)", params);
    }
    return;
  }

  try {
    await notificationLogClient.upsert({
      where: { dedupeKey: params.dedupeKey },
      update: {
        status: params.status,
        error: params.error || null,
        payload: (params.payload || null) as any,
        sendAt: params.sendAt || null,
        sentAt: params.status === "SENT" ? new Date() : null,
      },
      create: {
        bookingId: params.bookingId || null,
        channel: params.channel,
        notificationType: params.notificationType,
        dedupeKey: params.dedupeKey,
        status: params.status,
        provider: params.provider,
        toAddress: params.toAddress || null,
        payload: (params.payload || null) as any,
        error: params.error || null,
        sendAt: params.sendAt || null,
        sentAt: params.status === "SENT" ? new Date() : null,
      },
    });
  } catch (error) {
    console.error("Notification logging failed", error);
  }
}

async function sendEmailWithLog(params: {
  bookingId: string;
  dedupeKey: string;
  notificationType: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  sendAt?: Date;
}) {
  if (!(await hasSent(params.dedupeKey))) {
    try {
      await sendEmail({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      console.info("Email notification sent", {
        bookingId: params.bookingId,
        notificationType: params.notificationType,
        to: params.to,
      });
      await logNotification({
        bookingId: params.bookingId,
        channel: "EMAIL",
        notificationType: params.notificationType,
        dedupeKey: params.dedupeKey,
        status: "SENT",
        provider: "RESEND",
        toAddress: params.to,
        payload: { subject: params.subject },
        sendAt: params.sendAt,
      });
    } catch (error) {
      console.error("Email notification failed", {
        bookingId: params.bookingId,
        notificationType: params.notificationType,
        to: params.to,
        error: error instanceof Error ? error.message : "Email send failed",
      });
      await logNotification({
        bookingId: params.bookingId,
        channel: "EMAIL",
        notificationType: params.notificationType,
        dedupeKey: params.dedupeKey,
        status: "FAILED",
        provider: "RESEND",
        toAddress: params.to,
        error: error instanceof Error ? error.message : "Email send failed",
        payload: { subject: params.subject },
        sendAt: params.sendAt,
      });
    }
  }
}

async function sendSmsWithLog(params: {
  bookingId: string;
  dedupeKey: string;
  notificationType: string;
  to: string;
  body: string;
  sendAt?: Date;
}) {
  if (!(await hasSent(params.dedupeKey))) {
    try {
      await sendSms(params.to, params.body);
      await logNotification({
        bookingId: params.bookingId,
        channel: "SMS",
        notificationType: params.notificationType,
        dedupeKey: params.dedupeKey,
        status: "SENT",
        provider: "TWILIO",
        toAddress: params.to,
        payload: { body: params.body },
        sendAt: params.sendAt,
      });
    } catch (error) {
      await logNotification({
        bookingId: params.bookingId,
        channel: "SMS",
        notificationType: params.notificationType,
        dedupeKey: params.dedupeKey,
        status: "FAILED",
        provider: "TWILIO",
        toAddress: params.to,
        error: error instanceof Error ? error.message : "SMS send failed",
        payload: { body: params.body },
        sendAt: params.sendAt,
      });
    }
  }
}

function getStartLabel(booking: BookingNotificationShape) {
  const start = booking.startAt || booking.bookingStartDateTime || booking.requestedDate;
  const timeZone = timeZoneByLocation[booking.location?.code || "YXE"] || "America/Regina";
  return start.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export async function sendBookingConfirmationNotifications(booking: BookingNotificationShape) {
  console.info("Notification attempt: booking confirmation", {
    bookingId: booking.id,
    status: booking.status,
    hasEmail: Boolean(booking.customer?.email),
    hasPhone: Boolean(booking.customer?.phone),
  });
  const manageUrl = getManageUrl(booking.clientManageToken);
  const startLabel = getStartLabel(booking);
  const customerEmail = booking.customer?.email || "";
  const forcedEmail = process.env.EMAIL_FORCE_TO?.trim() || "";
  const emailRecipient = customerEmail || forcedEmail;
  const customerPhone = booking.customer?.phone || "";
  const customerName = booking.customer?.fullName || "Customer";
  const suffix = booking.updatedAt?.toISOString() || booking.requestedDate.toISOString();

  if (emailRecipient && isFeatureEnabled("EMAIL_ENABLED")) {
    await sendEmailWithLog({
      bookingId: booking.id,
      dedupeKey: makeDedupeKey([booking.id, "BOOKING_CONFIRMATION_EMAIL", suffix]),
      notificationType: "BOOKING_CONFIRMATION",
      to: emailRecipient,
      subject: "Your detailing appointment is confirmed",
      html: `<p>Hi ${customerName},</p><p>Your appointment is confirmed for ${startLabel}.</p><p>Manage booking: <a href="${manageUrl}">${manageUrl}</a></p>`,
      text: `Hi ${customerName}, your appointment is confirmed for ${startLabel}. Manage booking: ${manageUrl}`,
    });
  } else {
    console.warn("Booking confirmation email skipped", {
      bookingId: booking.id,
      hasCustomerEmail: Boolean(customerEmail),
      hasForcedEmail: Boolean(forcedEmail),
      emailFeatureEnabled: isFeatureEnabled("EMAIL_ENABLED"),
    });
  }

  if (customerPhone && isFeatureEnabled("SMS_ENABLED")) {
    await sendSmsWithLog({
      bookingId: booking.id,
      dedupeKey: makeDedupeKey([booking.id, "BOOKING_CONFIRMATION_SMS", suffix]),
      notificationType: "BOOKING_CONFIRMATION",
      to: customerPhone,
      body: `YXE/YYC Detailing: Your booking is confirmed for ${startLabel}. Manage: ${manageUrl}`,
    });
  }
}

export async function sendBookingReminders(now = new Date()) {
  if (!isFeatureEnabled("REMINDERS_ENABLED")) return { processed: 0 };

  const startWindow48 = new Date(now.getTime() + 47.5 * 60 * 60 * 1000);
  const endWindow48 = new Date(now.getTime() + 48.5 * 60 * 60 * 1000);
  const startWindow24 = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
  const endWindow24 = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "SCHEDULED"] as any },
      OR: [
        { startAt: { gte: startWindow24, lte: endWindow48 } },
        { bookingStartDateTime: { gte: startWindow24, lte: endWindow48 } },
      ],
    },
    include: { customer: true, service: true, location: true },
  });

  let processed = 0;
  for (const booking of bookings) {
    const start = booking.startAt || booking.bookingStartDateTime || booking.requestedDate;
    const diffMs = start.getTime() - now.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    const manageUrl = getManageUrl(booking.clientManageToken);

    if (
      hours >= 23.5 &&
      hours <= 24.5 &&
      booking.customer?.email &&
      isFeatureEnabled("EMAIL_ENABLED")
    ) {
      await sendEmailWithLog({
        bookingId: booking.id,
        dedupeKey: makeDedupeKey([booking.id, "REMINDER_EMAIL_24H", start.toISOString()]),
        notificationType: "REMINDER_EMAIL_24H",
        to: booking.customer.email,
        subject: "Reminder: your detailing appointment is tomorrow",
        html: `<p>Reminder for ${getStartLabel(booking as any)}.</p><p>Manage booking: <a href="${manageUrl}">${manageUrl}</a></p>`,
        text: `Reminder for ${getStartLabel(booking as any)}. Manage booking: ${manageUrl}`,
        sendAt: now,
      });
      processed += 1;
    }

    if (
      hours >= 47.5 &&
      hours <= 48.5 &&
      booking.customer?.phone &&
      isFeatureEnabled("SMS_ENABLED")
    ) {
      await sendSmsWithLog({
        bookingId: booking.id,
        dedupeKey: makeDedupeKey([booking.id, "REMINDER_SMS_48H", start.toISOString()]),
        notificationType: "REMINDER_SMS_48H",
        to: booking.customer.phone,
        body: `Reminder: your detailing appointment is in 48h (${getStartLabel(
          booking as any
        )}). Manage: ${manageUrl}`,
        sendAt: now,
      });
      processed += 1;
    }
  }

  return { processed };
}

export async function sendTestNotification(params: {
  bookingId: string;
  type: "CONFIRMATION" | "REMINDER_24H_EMAIL" | "REMINDER_48H_SMS";
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { customer: true, service: true, location: true },
  });
  if (!booking) throw new Error("Booking not found");

  if (params.type === "CONFIRMATION") {
    await sendBookingConfirmationNotifications(booking as any);
    return;
  }

  const now = new Date();
  const manageUrl = getManageUrl(booking.clientManageToken);
  if (params.type === "REMINDER_24H_EMAIL" && booking.customer?.email) {
    await sendEmailWithLog({
      bookingId: booking.id,
      dedupeKey: makeDedupeKey([booking.id, "TEST_REMINDER_24H_EMAIL", now.toISOString()]),
      notificationType: "TEST_REMINDER_24H_EMAIL",
      to: booking.customer.email,
      subject: "Test reminder (24h email)",
      html: `<p>Test 24h reminder.</p><p>Manage booking: <a href="${manageUrl}">${manageUrl}</a></p>`,
      text: `Test 24h reminder. Manage booking: ${manageUrl}`,
    });
  }

  if (params.type === "REMINDER_48H_SMS" && booking.customer?.phone) {
    await sendSmsWithLog({
      bookingId: booking.id,
      dedupeKey: makeDedupeKey([booking.id, "TEST_REMINDER_48H_SMS", now.toISOString()]),
      notificationType: "TEST_REMINDER_48H_SMS",
      to: booking.customer.phone,
      body: `Test 48h SMS reminder. Manage: ${manageUrl}`,
    });
  }
}
