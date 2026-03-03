import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../lib/admin-auth";
import { getDiscountCodeCapabilities } from "../../../lib/discount-code-capabilities";
import { isDiscountCodeFormatValid, normalizeDiscountCode } from "../../../lib/discount-codes";
import { prisma } from "../../../lib/prisma";

const listSchema = z.object({
  search: z.string().optional(),
  scope: z.enum(["active", "all"]).optional(),
});

const createSchema = z.object({
  code: z.string().min(3).max(32),
  description: z.string().max(200).optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED_CENTS"]),
  percentOff: z.number().int().min(1).max(100).optional(),
  fixedAmountCents: z.number().int().positive().max(1_000_000).optional(),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  endsAt: z.string().datetime().optional().or(z.literal("")),
  maxRedemptions: z.number().int().positive().max(100_000).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(3),
  isActive: z.boolean(),
});

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hasDiscountCodes } = await getDiscountCodeCapabilities();
  if (!hasDiscountCodes) {
    return NextResponse.json(
      { error: "Discount codes unavailable until migration runs." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const search = parsed.data.search?.trim();
  const scope = parsed.data.scope || "all";
  const items = await prisma.discountCode.findMany({
    where: {
      ...(scope === "active" ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search.toUpperCase() } },
              { description: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  return NextResponse.json({ codes: items });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hasDiscountCodes } = await getDiscountCodeCapabilities();
  if (!hasDiscountCodes) {
    return NextResponse.json(
      { error: "Discount codes unavailable until migration runs." },
      { status: 503 }
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedCode = normalizeDiscountCode(parsed.data.code);
  if (!isDiscountCodeFormatValid(normalizedCode)) {
    return NextResponse.json(
      { error: "Code must be 3-32 chars using letters, numbers, - or _." },
      { status: 400 }
    );
  }

  if (parsed.data.discountType === "PERCENTAGE" && !parsed.data.percentOff) {
    return NextResponse.json({ error: "Percent off is required." }, { status: 400 });
  }
  if (parsed.data.discountType === "FIXED_CENTS" && !parsed.data.fixedAmountCents) {
    return NextResponse.json({ error: "Fixed discount amount is required." }, { status: 400 });
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null;
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (startsAt && endsAt && startsAt > endsAt) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  try {
    const created = await prisma.discountCode.create({
      data: {
        code: normalizedCode,
        description: parsed.data.description?.trim() || null,
        discountType: parsed.data.discountType,
        percentOff:
          parsed.data.discountType === "PERCENTAGE" ? parsed.data.percentOff || null : null,
        fixedAmountCents:
          parsed.data.discountType === "FIXED_CENTS" ? parsed.data.fixedAmountCents || null : null,
        startsAt,
        endsAt,
        maxRedemptions: parsed.data.maxRedemptions || null,
        isActive: parsed.data.isActive ?? true,
        createdBy: process.env.ADMIN_EMAIL || "admin",
      },
    });
    return NextResponse.json({ code: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create discount code." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hasDiscountCodes } = await getDiscountCodeCapabilities();
  if (!hasDiscountCodes) {
    return NextResponse.json(
      { error: "Discount codes unavailable until migration runs." },
      { status: 503 }
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await prisma.discountCode.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  });
  return NextResponse.json({ code: updated });
}
