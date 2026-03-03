DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'BookingStatus' AND e.enumlabel = 'NO_SHOW'
  ) THEN
    ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "BlockedCustomer" (
  "id" TEXT NOT NULL,
  "fullName" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "reason" TEXT,
  "blockedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlockedCustomer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BlockedCustomer_phone_idx" ON "BlockedCustomer"("phone");
CREATE INDEX IF NOT EXISTS "BlockedCustomer_email_idx" ON "BlockedCustomer"("email");
