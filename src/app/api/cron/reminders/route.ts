import { NextResponse } from "next/server";
import { sendBookingReminders } from "../../../../lib/notifications";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendBookingReminders(new Date());
  return NextResponse.json({ ok: true, ...result });
}
