# Zapier Integrations

This app can push booking events to Zapier so you can automate:
- Square customer create/update
- CompanyCam project create

No payment/deposit logic is included.

## Environment variables

Set these in local `.env` and Vercel:

- `INTEGRATIONS_ENABLED=true`
- `ZAPIER_BOOKING_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/...`
- `ZAPIER_WEBHOOK_SECRET=your_shared_secret`

## Outbound events sent by app

The app sends booking events to `ZAPIER_BOOKING_WEBHOOK_URL` with retries and idempotency.

Events:
- `BOOKING_CREATED`
- `BOOKING_CONFIRMED`
- `BOOKING_COMPLETED`
- `BOOKING_CANCELLED`

Payload shape:
- `eventType`
- `bookingId`
- `bookingData` with:
  - `status`
  - `startAt`
  - `location`
  - `service`
  - `customer` (`name`, `email`, `phone`)
  - `vehicle`
  - `address` (if present)
  - `intakeAnswers` (if present)

Headers:
- `Idempotency-Key` = hash of `bookingId + eventType + updatedAt`
- `X-Zapier-Signature` = `sha256=<hmac hex>`

## Inbound endpoints

### 1) Catch event receiver
`POST /api/integrations/zapier/booking-event`

Purpose:
- Verify HMAC signature
- Validate payload
- Log receipt

### 2) External ID callback
`POST /api/integrations/zapier/booking-link`

Payload:
- `bookingId`
- `squareCustomerId` (optional)
- `companyCamProjectId` (optional)

This stores external IDs on booking rows.

## Signature details

For inbound routes, sign the raw JSON body using:
- algo: `HMAC-SHA256`
- key: `ZAPIER_WEBHOOK_SECRET`
- header: `X-Zapier-Signature: sha256=<hex>`

## Zap setup

## Zap A: Square customer sync
1. Trigger: **Webhooks by Zapier → Catch Hook**
2. Use URL from `ZAPIER_BOOKING_WEBHOOK_URL`
3. Add Filter:
   - pass only `eventType` in (`BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_COMPLETED`)
4. Action: **Square → Create Customer** (or Find/Create)
5. Map:
   - Given Name / Full Name from `bookingData.customer.name`
   - Email from `bookingData.customer.email`
   - Phone from `bookingData.customer.phone`
6. Optional callback:
   - Webhooks by Zapier → POST to `/api/integrations/zapier/booking-link`
   - Send `bookingId` + `squareCustomerId`
   - Include signed header.

## Zap B: CompanyCam project create
1. Trigger: **Webhooks by Zapier → Catch Hook**
2. Add Filter:
   - pass only `eventType` in (`BOOKING_CREATED`, `BOOKING_CONFIRMED`)
3. Action: **CompanyCam → Create Project**
4. Map:
   - Project name: `${bookingData.customer.name} - ${bookingData.service}`
   - Address: `bookingData.address` (if available)
   - Notes: booking ID + city + start time
5. Optional callback:
   - POST to `/api/integrations/zapier/booking-link`
   - Send `bookingId` + `companyCamProjectId`
   - Include signed header.

## Failure behavior

- Outbound sends retry 3 times with exponential backoff.
- Failed sends are written to `IntegrationLog` with payload + error.
- Booking flow is not blocked by Zapier failures.
