import { isFeatureEnabled } from "./feature-flags";

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

const fromAddress = process.env.EMAIL_FROM || "YXE/YYC Detailing <onboarding@resend.dev>";
const forcedRecipient = process.env.EMAIL_FORCE_TO?.trim();

export async function sendEmail(payload: EmailPayload) {
  if (!isFeatureEnabled("EMAIL_ENABLED")) {
    console.warn("Email skipped: EMAIL_ENABLED is false");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("Email skipped: RESEND_API_KEY is missing");
    return;
  }

  const to = forcedRecipient || payload.to;
  if (forcedRecipient) {
    console.info("Email test mode enabled: overriding recipient", {
      originalTo: payload.to,
      forcedTo: forcedRecipient
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromAddress,
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Failed to send email");
    console.error("Resend send failed", {
      status: response.status,
      message,
      from: fromAddress,
      keyLength: apiKey.length
    });
    throw new Error(message);
  }
}

type BookingEmailContext = {
  bookingId: string;
  location: string;
  serviceName: string;
  requestedDate: string;
  requestedWindow: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  addOns?: string[];
  manageUrl?: string;
};

export async function sendBookingCreatedEmails(context: BookingEmailContext) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const addOns = context.addOns?.length ? `Add-ons: ${context.addOns.join(", ")}` : "Add-ons: none";
  const lines = [
    `Booking ID: ${context.bookingId}`,
    `Location: ${context.location}`,
    `Service: ${context.serviceName}`,
    addOns,
    `Date & Time: ${context.requestedDate} (${context.requestedWindow})`,
    `Customer: ${context.customerName}`,
    `Phone: ${context.customerPhone}`,
    context.customerEmail ? `Email: ${context.customerEmail}` : "Email: not provided"
  ];

  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New confirmed booking · ${context.location}`,
      html: lines.map((line) => `<p>${line}</p>`).join(""),
      text: lines.join("\n")
    });
  }

  // Customer confirmation notifications are handled in src/lib/notifications.ts
}

type BookingStatusContext = {
  bookingId: string;
  location: string;
  serviceName: string;
  requestedDate: string;
  requestedWindow: string;
  customerName: string;
  customerEmail?: string | null;
  status: string;
};

export async function sendBookingStatusEmail(context: BookingStatusContext) {
  if (!context.customerEmail) return;

  await sendEmail({
    to: context.customerEmail,
    subject: `Booking update: ${context.status.replaceAll("_", " ")}`,
    html: `
      <p>Hi ${context.customerName},</p>
      <p>Your booking status has been updated to <strong>${context.status.replaceAll("_", " ")}</strong>.</p>
      <p>Booking ID: ${context.bookingId}</p>
      <p>Service: ${context.serviceName}</p>
      <p>Date & Time: ${context.requestedDate} (${context.requestedWindow})</p>
      <p>If you have questions, reply to this email.</p>
    `,
    text: [
      `Hi ${context.customerName},`,
      `Your booking status has been updated to ${context.status.replaceAll("_", " ")}.`,
      `Booking ID: ${context.bookingId}`,
      `Service: ${context.serviceName}`,
      `Date & Time: ${context.requestedDate} (${context.requestedWindow})`
    ].join("\n")
  });
}
