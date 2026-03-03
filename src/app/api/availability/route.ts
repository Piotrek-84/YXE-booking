import { NextResponse } from "next/server";
import { getAvailableSlots } from "../../../lib/availability-engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get("location") || "YXE";
  const serviceId = searchParams.get("serviceId");
  const durationMins = Number(searchParams.get("durationMins") || "");
  const bufferMins = Number(searchParams.get("bufferMins") || "");

  if (!serviceId && !Number.isFinite(durationMins)) {
    return NextResponse.json({ slots: [] });
  }

  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + 21);

  const slots = await getAvailableSlots({
    locationCode: location,
    serviceId: serviceId || undefined,
    serviceDurationMinutes: Number.isFinite(durationMins) ? durationMins : undefined,
    serviceBufferMinutes: Number.isFinite(bufferMins) ? bufferMins : undefined,
    from: now,
    to: end
  });

  return NextResponse.json({
    slots: slots.map((slot) => ({
      start: slot.startAt,
      end: slot.endAt,
      label: slot.label,
      remainingCapacity: slot.remainingCapacity,
      isAvailable: slot.isAvailable
    }))
  });
}
