ALTER TABLE "BlockedCustomer"
  ADD COLUMN IF NOT EXISTS "isPotentialMaintenance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "maintenanceReason" TEXT,
  ADD COLUMN IF NOT EXISTS "maintenanceMarkedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maintenanceMarkedBy" TEXT;

CREATE INDEX IF NOT EXISTS "BlockedCustomer_isPotentialMaintenance_idx" ON "BlockedCustomer"("isPotentialMaintenance");
