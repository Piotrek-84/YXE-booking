import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";

const querySchema = z.object({
  location: z.string().optional()
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    location: searchParams.get("location") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const locationFilter = parsed.data.location
    ? { code: parsed.data.location }
    : undefined;

  const locations = await prisma.location.findMany({
    where: locationFilter,
    include: {
      services: { where: { active: true } },
      addOns: { where: { active: true } }
    }
  });

  const services = locations.flatMap((location) =>
    location.services.map((service) => ({
      id: service.id,
      locationCode: location.code,
      name: service.name,
      description: service.description,
      basePriceCents: service.basePriceCents,
      durationMinutes: service.durationMinutes
    }))
  );

  const addOns = locations.flatMap((location) =>
    location.addOns.map((addOn) => ({
      id: addOn.id,
      locationCode: location.code,
      name: addOn.name,
      description: addOn.description,
      priceCents: addOn.priceCents,
      durationMinutes: addOn.durationMinutes
    }))
  );

  return NextResponse.json({ services, addOns });
}
