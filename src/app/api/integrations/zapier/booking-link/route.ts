import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isValidSignature,
  writeIntegrationInboundLog,
} from "../../../../../lib/integrations/zapier";
import { prisma } from "../../../../../lib/prisma";

const linkSchema = z.object({
  bookingId: z.string().min(3),
  squareCustomerId: z.string().optional(),
  companyCamProjectId: z.string().optional(),
});

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-zapier-signature");
  if (!isValidSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw);
  const parsed = linkSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const booking = await (prisma as any).booking.update({
    where: { id: parsed.data.bookingId },
    data: {
      squareCustomerId: parsed.data.squareCustomerId || null,
      companyCamProjectId: parsed.data.companyCamProjectId || null,
    },
  });

  await writeIntegrationInboundLog({
    eventType: "BOOKING_LINK_UPDATED",
    bookingId: booking.id,
    payload: parsed.data,
    status: "LINKED",
  });

  return NextResponse.json({ ok: true });
}
