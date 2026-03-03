export function isFeatureEnabled(
  name:
    | "EMAIL_ENABLED"
    | "SMS_ENABLED"
    | "REMINDERS_ENABLED"
    | "GOOGLE_SYNC_ENABLED"
    | "INTEGRATIONS_ENABLED"
) {
  const value = process.env[name];
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getAppBaseUrl() {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
