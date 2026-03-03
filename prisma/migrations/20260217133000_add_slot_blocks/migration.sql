-- CreateTable
CREATE TABLE "SlotBlock" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "slotLine" INTEGER NOT NULL,
    "reason" TEXT,
    "blockedBy" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlotBlock_locationId_slotKey_slotLine_key" ON "SlotBlock"("locationId", "slotKey", "slotLine");

-- CreateIndex
CREATE INDEX "SlotBlock_locationId_startAt_idx" ON "SlotBlock"("locationId", "startAt");

-- AddForeignKey
ALTER TABLE "SlotBlock" ADD CONSTRAINT "SlotBlock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
