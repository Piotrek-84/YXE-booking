import { NextResponse } from "next/server";
import { z } from "zod";
import { getDiscountCodeCapabilities } from "../../../../lib/discount-code-capabilities";
import {
  computeDiscountAmountCents,
  isDiscountCodeFormatValid,
  normalizeDiscountCode,
} from "../../../../lib/discount-codes";
import { prisma } from "../../../../lib/prisma";

const requestSchema = z.object({
  code: z.string().min(3).max(32),
  subtotalCents: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const normalizedCode = normalizeDiscountCode(parsed.data.code);
  if (!isDiscountCodeFormatValid(normalizedCode)) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "Discount code format is invalid.",
    });
  }

  const { hasDiscountCodes } = await getDiscountCodeCapabilities();
  if (!hasDiscountCodes) {
    return NextResponse.json(
      { ok: false, error: "Discount codes are not configured yet." },
      { status: 503 }
    );
  }

  const code = await prisma.discountCode.findFirst({
    where: { code: normalizedCode, isActive: true },
  });
  if (!code) {
    return NextResponse.json({ ok: true, valid: false, message: "Discount code not found." });
  }

  const now = new Date();
  if (code.startsAt && code.startsAt > now) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This discount code is not active yet.",
    });
  }
  if (code.endsAt && code.endsAt < now) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This discount code has expired.",
    });
  }
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This discount code has reached its usage limit.",
    });
  }

  const discountCents = computeDiscountAmountCents(parsed.data.subtotalCents, {
    discountType: code.discountType,
    percentOff: code.percentOff,
    fixedAmountCents: code.fixedAmountCents,
  });
  if (discountCents <= 0) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "This discount code does not apply to the selected booking.",
    });
  }

  const finalTotalCents = Math.max(0, parsed.data.subtotalCents - discountCents);
  return NextResponse.json({
    ok: true,
    valid: true,
    message: "Discount code applied.",
    code: code.code,
    description: code.description,
    discountType: code.discountType,
    percentOff: code.percentOff,
    fixedAmountCents: code.fixedAmountCents,
    discountCents,
    finalTotalCents,
  });
}
