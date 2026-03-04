import { NextResponse } from "next/server";
import { isMasterAdmin } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";

const setupStatements = [
  `DO $$ BEGIN
    CREATE TYPE "EmployeeRole" AS ENUM ('DETAILER', 'SUPERVISOR');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    CREATE TYPE "ScheduleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `ALTER TABLE "SlotBlock"
    ADD COLUMN IF NOT EXISTS "isAutoStaffBlock" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "SlotBlock_locationId_isAutoStaffBlock_startAt_idx"
    ON "SlotBlock"("locationId", "isAutoStaffBlock", "startAt")`,
  `CREATE TABLE IF NOT EXISTS "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "scheduleName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL DEFAULT 'DETAILER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS "scheduleName" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Employee_email_key"
    ON "Employee"("email")`,
  `CREATE INDEX IF NOT EXISTS "Employee_isActive_role_idx"
    ON "Employee"("isActive", "role")`,
  `CREATE TABLE IF NOT EXISTS "EmployeeShift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeShift_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "EmployeeShift"
    ADD COLUMN IF NOT EXISTS "isDayOff" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeShift_employeeId_locationCode_shiftDate_startTime_endTime_key"
    ON "EmployeeShift"("employeeId", "locationCode", "shiftDate", "startTime", "endTime")`,
  `CREATE INDEX IF NOT EXISTS "EmployeeShift_locationCode_shiftDate_idx"
    ON "EmployeeShift"("locationCode", "shiftDate")`,
  `CREATE INDEX IF NOT EXISTS "EmployeeShift_employeeId_shiftDate_idx"
    ON "EmployeeShift"("employeeId", "shiftDate")`,
  `CREATE TABLE IF NOT EXISTS "ScheduleEmailLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationCode" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "requestToken" TEXT NOT NULL,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleEmailLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleEmailLog_requestToken_key"
    ON "ScheduleEmailLog"("requestToken")`,
  `CREATE INDEX IF NOT EXISTS "ScheduleEmailLog_employeeId_sentAt_idx"
    ON "ScheduleEmailLog"("employeeId", "sentAt")`,
  `CREATE TABLE IF NOT EXISTS "ScheduleChangeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationCode" TEXT,
    "requestType" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3),
    "requestedStartTime" TEXT,
    "requestedEndTime" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ScheduleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "scheduleEmailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ScheduleChangeRequest_status_createdAt_idx"
    ON "ScheduleChangeRequest"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ScheduleChangeRequest_employeeId_createdAt_idx"
    ON "ScheduleChangeRequest"("employeeId", "createdAt")`,
  `DO $$ BEGIN
    ALTER TABLE "EmployeeShift"
      ADD CONSTRAINT "EmployeeShift_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "ScheduleEmailLog"
      ADD CONSTRAINT "ScheduleEmailLog_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "ScheduleChangeRequest"
      ADD CONSTRAINT "ScheduleChangeRequest_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "ScheduleChangeRequest"
      ADD CONSTRAINT "ScheduleChangeRequest_scheduleEmailLogId_fkey"
      FOREIGN KEY ("scheduleEmailLogId") REFERENCES "ScheduleEmailLog"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "AdminUser" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_login_key"
    ON "AdminUser"("login")`,
  `CREATE INDEX IF NOT EXISTS "AdminUser_isActive_login_idx"
    ON "AdminUser"("isActive", "login")`,
];

export async function POST() {
  if (!(await isMasterAdmin())) {
    return NextResponse.json({ error: "Only master admin can run setup." }, { status: 403 });
  }

  try {
    for (const statement of setupStatements) {
      await prisma.$executeRawUnsafe(statement);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
