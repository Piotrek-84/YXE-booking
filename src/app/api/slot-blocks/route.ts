import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { isAdminAuthorized } from "../../../lib/admin-auth";
import { makeSlotKey } from "../../../lib/availability-engine";

const slotBlockClient = (prisma as any).slotBlock;

const listSchema = z.object({
  location: z.string().min(2),
  dateFrom: z.string().min(8),
  dateTo: z.string().min(8)
});

const createSchema = z.object({
  locationCode: z.string().min(2),
  startAt: z.string().min(8),
  endAt: z.string().min(8).optional(),
  slotLine: z.number().int().min(1).max(4),
  reason: z.string().max(250).optional()
});

const removeSchema = z.object({
  id: z.string().min(3)
});

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    location: searchParams.get("location"),
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const location = await prisma.location.findUnique({
    where: { code: parsed.data.location }
  });
  if (!location) return NextResponse.json({ blocks: [] });

  const start = new Date(`${parsed.data.dateFrom}T00:00:00`);
  const end = new Date(`${parsed.data.dateTo}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  if (!slotBlockClient) {
    return NextResponse.json({ blocks: [] });
  }

  const blocks = await slotBlockClient.findMany({
    where: {
      locationId: location.id,
      startAt: { gte: start, lte: end }
    },
    orderBy: [{ startAt: "asc" }, { slotLine: "asc" }]
  });

  return NextResponse.json({ blocks });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const location = await prisma.location.findUnique({
    where: { code: parsed.data.locationCode }
  });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const startAt = new Date(parsed.data.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
  }
  const endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : new Date(startAt.getTime() + 60 * 60000);
  if (Number.isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
  }

  const slotKey = makeSlotKey(parsed.data.locationCode, startAt);
  const actor = process.env.ADMIN_EMAIL || "admin";

  if (!slotBlockClient) {
    return NextResponse.json({ error: "Slot blocks unavailable until migration runs" }, { status: 503 });
  }

  const block = await slotBlockClient.upsert({
    where: {
      locationId_slotKey_slotLine: {
        locationId: location.id,
        slotKey,
        slotLine: parsed.data.slotLine
      }
    },
    update: {
      reason: parsed.data.reason || null,
      blockedBy: actor,
      startAt,
      endAt
    },
    create: {
      locationId: location.id,
      slotKey,
      slotLine: parsed.data.slotLine,
      reason: parsed.data.reason || null,
      blockedBy: actor,
      startAt,
      endAt
    }
  });

  return NextResponse.json({ block });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = removeSchema.safeParse({
    id: searchParams.get("id")
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!slotBlockClient) {
    return NextResponse.json({ error: "Slot blocks unavailable until migration runs" }, { status: 503 });
  }

  await slotBlockClient.delete({
    where: { id: parsed.data.id }
  });

  return NextResponse.json({ ok: true });
}
