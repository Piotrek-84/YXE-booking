# Acuity Replacement Parity Audit

## Scope
- App: Next.js + Prisma + Vercel
- Audit date: 2026-02-16
- Objective: determine readiness to replace Acuity on yxequickclean.ca (no in-app payments/deposits)

## Current Capabilities Found

### Booking + Availability
- Public booking flow (city/service/add-ons/time/customer review): `src/app/booking/page.tsx`
- Availability endpoint: `src/app/api/availability/route.ts`
- Availability engine + capacity logic: `src/lib/availability-engine.ts`
- Slot schedule config: `config/schedules.ts`
- Booking creation + validation + conflict handling: `src/app/api/bookings/route.ts`
- DB-level conflict guard (seat-per-slot unique index): `prisma/migrations/20260216143000_acuity_replacement_phase123/migration.sql`

### Admin
- Shared admin shell and navigation: `src/app/admin/AdminLayoutShell.tsx`, `src/app/admin/layout.tsx`
- Admin bookings list/calendar + drawer updates: `src/app/admin/bookings/page.tsx`
- Booking detail page: `src/app/admin/bookings/[id]/page.tsx`
- Admin auth/session + middleware protection: `src/app/api/admin/login/route.ts`, `src/lib/auth.ts`, `middleware.ts`

### Customer Self-Service Manage Link
- Secure tokenized management API: `src/app/api/manage/[token]/route.ts`
- Manage booking UI page: `src/app/manage/[token]/page.tsx`
- Token generation/helpers: `src/lib/tokens.ts`

### Email
- Email adapter/service: `src/lib/email.ts`
- Feature flags: `src/lib/feature-flags.ts`
- Confirmation + status messages integrated in booking and manage routes.

### Data Model
- Core entities + add-ons + services + bookings: `prisma/schema.prisma`
- Added models: `LocationHours`, `AvailabilityOverride`, `BlackoutDate`, `CapacityRule`, `ServiceIntakeField`, `ReminderLog`, `BookingAudit`.

## Missing / Partial by Capability

### Availability Engine
- Implemented for v1 with location hours/overrides/blackouts + capacity.
- Missing: richer operating rules UI in admin to manage hours/overrides/blackouts.

### Client Self-Serve
- Implemented tokenized cancel/reschedule with cutoff policy.
- Missing: dedicated “pick from available slots” UI on manage page (currently datetime input, server-validated).

### Reminders
- Missing execution pipeline. `ReminderLog` exists, but no cron sender route yet.

### Intake Forms
- Data model supports dynamic intake (`ServiceIntakeField`, `Booking.intakeAnswers`).
- Missing public dynamic field rendering + admin display section.

### Calendar Sync
- Missing implementation. `googleEventId` and `GOOGLE_SYNC_ENABLED` prepared but no Google Calendar adapter/routes yet.

### Admin Workflow
- Improved filters/list/calendar/drawer done.
- Missing: saved views + bulk actions persistence backend endpoints.

### Audit Log
- Data model + write paths are present in booking create/admin update/client manage.
- Missing: dedicated activity tab rendering in admin drawer UI.

### Exports
- Filtered CSV export supported in `/admin/bookings`.
- Missing: export endpoint for large dataset/background export.

## Go / No-Go for Replacing Acuity Today

**Decision: NO-GO (today), close to GO after reminders + calendar sync + intake UI are completed.**

### Evidence
- Core online booking, conflict prevention, and self-serve reschedule/cancel are present.
- But three operationally critical parity gaps remain:
  1. Automated reminders (24h/2h) are not sending yet.
  2. Calendar sync to Google is not implemented.
  3. Intake forms are not yet rendered for customers/admin even though schema exists.

### Practical Recommendation
- Safe pilot on low volume (manual reminders + manual calendar handling) is possible.
- Full Acuity replacement for daily production should wait until reminders + calendar sync + intake UI are complete and tested.
