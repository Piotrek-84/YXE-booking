CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT,
  "channel" TEXT NOT NULL,
  "notificationType" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "toAddress" TEXT,
  "payload" JSONB,
  "error" TEXT,
  "sendAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_bookingId_createdAt_idx" ON "NotificationLog"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_notificationType_createdAt_idx" ON "NotificationLog"("notificationType", "createdAt");
