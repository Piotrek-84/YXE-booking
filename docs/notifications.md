# Notifications (Email + SMS)

This app supports booking notifications using:
- Email: Resend
- SMS: Twilio

No payment/deposit workflow is included.

## Environment variables

Set in local `.env` and Vercel project env:

- `APP_BASE_URL` (e.g. `https://yxe-yyc-detailing.vercel.app`)
- `EMAIL_ENABLED=true`
- `SMS_ENABLED=true`
- `REMINDERS_ENABLED=true`
- `RESEND_API_KEY=...`
- `EMAIL_FROM=YXE/YYC Detailing <onboarding@resend.dev>` (no DNS test mode)
- `EMAIL_FORCE_TO=you@your-email.com` (optional, routes all outgoing emails to one inbox for testing)
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_FROM_NUMBER=+1XXXXXXXXXX`
- `CRON_SECRET=...` (recommended for cron endpoint auth)

## Resend without DNS (test mode)

If you do not verify a domain in Resend yet:
- Keep sender as `onboarding@resend.dev`.
- Resend may only allow sending to your own account email in this mode.
- Use `EMAIL_FORCE_TO` so booking emails are still generated and delivered to your inbox.

When you are ready for production client emails, verify your own domain and set:
- `EMAIL_FROM=YXE/YYC Detailing <bookings@yourdomain.com>`
- remove `EMAIL_FORCE_TO`

## What sends and when

## Immediate confirmation

Sent when booking is created (current flow) and when status becomes `CONFIRMED`:
- Confirmation Email
- Confirmation SMS

All include secure manage link:
- `/manage/[token]`

## Reminders (Cron)

Route:
- `GET /api/cron/reminders`

Behavior:
- 24h Email reminder
- 48h SMS reminder
- Uses `NotificationLog` dedupe keys to prevent duplicates.

## Manual test endpoint

Route:
- `POST /api/admin/notifications/test`

Auth:
- Admin session required.

Body:
```json
{
  "bookingId": "BOOKING_ID",
  "type": "CONFIRMATION"
}
```

`type` options:
- `CONFIRMATION`
- `REMINDER_24H_EMAIL`
- `REMINDER_48H_SMS`

## Notification logging / dedupe

Table:
- `NotificationLog`

Used for:
- send status (`SENT`, `FAILED`, `SKIPPED`)
- channel/provider metadata
- dedupe via unique `dedupeKey`
- failure error payloads for troubleshooting

## Vercel Cron setup

In Vercel, add a cron job to call:
- `/api/cron/reminders`

Recommended:
- every 15 minutes
- include header `Authorization: Bearer <CRON_SECRET>`

## Quick verification checklist

1. Create a test booking with email + phone.
2. Confirm immediate email + SMS are sent.
3. Hit test endpoint for each type and verify delivery.
4. Check DB `NotificationLog` rows for sent/failed status.
5. Re-run same test event and verify dedupe prevents duplicates.
