-- AlterTable
ALTER TABLE "Service" ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "serviceName" TEXT,
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "intakeAnswers" JSONB,
ADD COLUMN "clientManageToken" TEXT,
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "updatedBy" TEXT,
ADD COLUMN "startAt" TIMESTAMP(3),
ADD COLUMN "endAt" TIMESTAMP(3),
ADD COLUMN "slotSequence" INTEGER,
ADD COLUMN "googleEventId" TEXT,
ADD COLUMN "canceledAt" TIMESTAMP(3);

-- Backfill for existing rows
UPDATE "Booking"
SET
  "startAt" = COALESCE("startAt", "bookingStartDateTime", "requestedDate"),
  "endAt" = COALESCE("endAt", "bookingStartDateTime", "requestedDate")
WHERE "startAt" IS NULL OR "endAt" IS NULL;

-- CreateTable
CREATE TABLE "LocationHours" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "openTime" TEXT NOT NULL,
  "closeTime" TEXT NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocationHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityOverride" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "openTime" TEXT,
  "closeTime" TEXT,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackoutDate" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityRule" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "maxBookingsPerSlot" INTEGER NOT NULL DEFAULT 4,
  "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceIntakeField" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "fieldType" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "placeholder" TEXT,
  "helperText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceIntakeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "reminderType" TEXT NOT NULL,
  "sendAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAudit" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingAudit_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "Booking_clientManageToken_key" ON "Booking"("clientManageToken");
CREATE INDEX "Booking_startAt_idx" ON "Booking"("startAt");
CREATE INDEX "Booking_tokenExpiresAt_idx" ON "Booking"("tokenExpiresAt");
CREATE UNIQUE INDEX "LocationHours_locationId_weekday_key" ON "LocationHours"("locationId", "weekday");
CREATE UNIQUE INDEX "AvailabilityOverride_locationId_date_key" ON "AvailabilityOverride"("locationId", "date");
CREATE UNIQUE INDEX "CapacityRule_locationId_key" ON "CapacityRule"("locationId");
CREATE UNIQUE INDEX "ServiceIntakeField_serviceId_key_key" ON "ServiceIntakeField"("serviceId", "key");
CREATE UNIQUE INDEX "ReminderLog_bookingId_reminderType_sendAt_key" ON "ReminderLog"("bookingId", "reminderType", "sendAt");

-- DB-level conflict protection: max capacity is enforced by slotSequence seats per slot.
-- Active bookings cannot share the same seat in the same slot.
CREATE UNIQUE INDEX "Booking_active_slot_seat_unique"
ON "Booking"("locationId", "startAt", "slotSequence")
WHERE "status" IN ('REQUESTED','CONFIRMED','SCHEDULED','IN_PROGRESS')
  AND "startAt" IS NOT NULL
  AND "slotSequence" IS NOT NULL;

-- Foreign keys
ALTER TABLE "LocationHours" ADD CONSTRAINT "LocationHours_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CapacityRule" ADD CONSTRAINT "CapacityRule_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceIntakeField" ADD CONSTRAINT "ServiceIntakeField_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingAudit" ADD CONSTRAINT "BookingAudit_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
