import { Prisma, ScheduleRequestStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";

const listSchema = z.object({
  status: z.nativeEnum(ScheduleRequestStatus).optional(),
  locationCode: z.string().min(2).max(12).optional(),
});

const updateSchema = z.object({
  id: z.string().min(3),
  status: z.nativeEnum(ScheduleRequestStatus),
  reviewNotes: z.string().max(500).optional(),
});

function isMissingTableError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    locationCode: searchParams.get("locationCode") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  let requests;
  try {
    requests = await prisma.scheduleChangeRequest.findMany({
      where: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.locationCode ? { locationCode: parsed.data.locationCode } : {}),
      },
      include: {
        employee: true,
        emailLog: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not load requests." }, { status: 500 });
  }

  return NextResponse.json({ requests });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const now = new Date();
  const requestItem = await prisma.scheduleChangeRequest.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.status,
      reviewNotes: parsed.data.reviewNotes || null,
      reviewedBy: process.env.ADMIN_EMAIL || "admin",
      reviewedAt: parsed.data.status === "PENDING" ? null : now,
    },
    include: {
      employee: true,
    },
  });

  return NextResponse.json({ request: requestItem });
}
