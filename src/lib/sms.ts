import { isFeatureEnabled } from "./feature-flags";

function toE164(phoneRaw: string) {
  const digits = phoneRaw.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export async function sendSms(to: string, body: string) {
  if (!isFeatureEnabled("SMS_ENABLED")) {
    console.warn("SMS skipped: SMS_ENABLED is false");
    return { skipped: true as const };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.warn("SMS skipped: Twilio env vars are missing");
    return { skipped: true as const };
  }

  const params = new URLSearchParams();
  params.set("To", toE164(to));
  params.set("From", from);
  params.set("Body", body);

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Twilio send failed");
    console.error("Twilio send failed", { status: response.status, message });
    throw new Error(message);
  }

  const data = await response.json().catch(() => null);
  return { skipped: false as const, data };
}
