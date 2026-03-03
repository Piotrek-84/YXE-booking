ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "clientDeviceHash" TEXT;

CREATE INDEX IF NOT EXISTS "Booking_clientDeviceHash_idx"
  ON "Booking"("clientDeviceHash");

CREATE TABLE IF NOT EXISTS "BlockedDevice" (
  "id" TEXT NOT NULL,
  "deviceHash" TEXT NOT NULL,
  "reason" TEXT,
  "blockedBy" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "linkedBlockedCustomerId" TEXT,
  "unblockedAt" TIMESTAMP(3),
  "unblockedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BlockedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlockedDevice_deviceHash_key"
  ON "BlockedDevice"("deviceHash");

CREATE INDEX IF NOT EXISTS "BlockedDevice_isActive_idx"
  ON "BlockedDevice"("isActive");

CREATE INDEX IF NOT EXISTS "BlockedDevice_linkedBlockedCustomerId_idx"
  ON "BlockedDevice"("linkedBlockedCustomerId");
