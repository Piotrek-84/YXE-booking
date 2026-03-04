CREATE TABLE IF NOT EXISTS "AdminUser" (
  "id" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_login_key"
  ON "AdminUser"("login");

CREATE INDEX IF NOT EXISTS "AdminUser_isActive_login_idx"
  ON "AdminUser"("isActive", "login");
