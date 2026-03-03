ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "squareCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "companyCamProjectId" TEXT;

CREATE TABLE IF NOT EXISTS "IntegrationLog" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "bookingId" TEXT,
  "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntegrationLog_provider_createdAt_idx" ON "IntegrationLog"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "IntegrationLog_bookingId_createdAt_idx" ON "IntegrationLog"("bookingId", "createdAt");
