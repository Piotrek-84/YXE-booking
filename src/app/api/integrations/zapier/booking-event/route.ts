import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isValidSignature,
  writeIntegrationInboundLog
} from "../../../../../lib/integrations/zapier";

const eventSchema = z.object({
  eventType: z.string().min(3),
  bookingId: z.string().min(3),
  bookingData: z.record(z.any())
});

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-zapier-signature");
  if (!isValidSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw);
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await writeIntegrationInboundLog({
    eventType: parsed.data.eventType,
    bookingId: parsed.data.bookingId,
    payload: parsed.data,
    status: "RECEIVED"
  });

  return NextResponse.json({ ok: true });
}
