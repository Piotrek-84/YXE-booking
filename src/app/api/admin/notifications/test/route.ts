import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../../lib/admin-auth";
import { sendTestNotification } from "../../../../../lib/notifications";

const schema = z.object({
  bookingId: z.string().min(3),
  type: z.enum(["CONFIRMATION", "REMINDER_24H_EMAIL", "REMINDER_48H_SMS"])
});

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await sendTestNotification(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Notification test failed" },
      { status: 500 }
    );
  }
}
