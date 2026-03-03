ALTER TABLE "BlockedCustomer"
  ADD COLUMN IF NOT EXISTS "clientFacingNote" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "unblockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "unblockedBy" TEXT;

CREATE INDEX IF NOT EXISTS "BlockedCustomer_isActive_idx" ON "BlockedCustomer"("isActive");
