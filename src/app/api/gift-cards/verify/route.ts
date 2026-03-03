import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  gan: z.string().min(6).max(64)
});

const SQUARE_VERSION = "2025-01-23";

function normalizeGiftCardNumber(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function getSquareBaseUrl() {
  const env = (process.env.SQUARE_ENV || "production").toLowerCase();
  return env === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const gan = normalizeGiftCardNumber(parsed.data.gan);
  if (gan.length < 8) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "Gift card number appears invalid."
    });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Gift card verification is not configured."
      },
      { status: 503 }
    );
  }

  const response = await fetch(`${getSquareBaseUrl()}/v2/gift-cards/from-gan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION
    },
    body: JSON.stringify({ gan })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "Gift card not found."
    });
  }

  const giftCard = data?.gift_card;
  if (!giftCard?.id) {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: "Gift card not found."
    });
  }

  const state = String(giftCard?.state || "").toUpperCase();
  if (state && state !== "ACTIVE") {
    return NextResponse.json({
      ok: true,
      valid: false,
      message: `Gift card is ${state.toLowerCase()}.`
    });
  }

  const balanceMoney = giftCard?.balance_money || null;

  return NextResponse.json({
    ok: true,
    valid: true,
    message: "Gift card verified.",
    cardId: giftCard.id,
    normalizedGan: gan,
    last4: gan.slice(-4),
    balanceAmount: typeof balanceMoney?.amount === "number" ? balanceMoney.amount : null,
    currency: typeof balanceMoney?.currency === "string" ? balanceMoney.currency : null
  });
}
