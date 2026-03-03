import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export async function writeBookingAudit(params: {
  bookingId: string;
  action: string;
  actor?: string | null;
  details?: Record<string, unknown>;
}) {
  await prisma.bookingAudit.create({
    data: {
      bookingId: params.bookingId,
      action: params.action,
      actor: params.actor || null,
      details: (params.details || undefined) as Prisma.InputJsonValue | undefined
    }
  });
}
