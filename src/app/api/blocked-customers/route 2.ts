import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { isAdminAuthorized } from "../../../lib/admin-auth";
import { normalizePhone } from "../../../lib/phone";

const createSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal("")),
  clientFacingNote: z.string().max(300).optional(),
  reason: z.string().max(500).optional(),
  isPotentialMaintenance: z.boolean().optional(),
  maintenanceReason: z.string().max(500).optional()
});

const listSchema = z.object({
  search: z.string().optional(),
  scope: z.enum(["active", "history", "all"]).optional(),
  category: z.enum(["blocked", "maintenance"]).optional()
});

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
    category: searchParams.get("category") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const search = parsed.data.search?.trim();
  const scope = parsed.data.scope || "all";
  const category = parsed.data.category || "blocked";

  const sharedSearchWhere = search
    ? {
        OR: [
          { fullName: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } }
        ]
      }
    : {};

  const where =
    category === "maintenance"
      ? {
          ...sharedSearchWhere,
          isPotentialMaintenance: true
        }
      : {
          ...sharedSearchWhere,
          ...(scope === "active" ? { isActive: true } : {}),
          ...(scope === "history" ? { isActive: false, unblockedAt: { not: null } } : {}),
          AND: [
            {
              OR: [
                { isPotentialMaintenance: false },
                { isActive: true },
                { unblockedAt: { not: null } }
              ]
            }
          ]
        };

  const blocked = await (prisma as any).blockedCustomer?.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500
  });

  return NextResponse.json({ blocked: blocked || [] });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockedCustomerClient = (prisma as any).blockedCustomer;
  if (!blockedCustomerClient) {
    return NextResponse.json(
      { error: "Blocked customers unavailable until migration runs" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 7) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const actor = process.env.ADMIN_EMAIL || "admin";
  const markAsPotentialMaintenance = parsed.data.isPotentialMaintenance === true;

  const existing = await blockedCustomerClient.findFirst({
    where: {
      OR: [{ phone }, ...(email ? [{ email }] : [])]
    }
  });

  if (existing) {
    const nextData: Record<string, unknown> = {
      fullName: parsed.data.fullName || existing.fullName
    };

    if (markAsPotentialMaintenance) {
      nextData.isPotentialMaintenance = true;
      nextData.maintenanceReason =
        parsed.data.maintenanceReason || parsed.data.reason || existing.maintenanceReason;
      nextData.maintenanceMarkedAt = new Date();
      nextData.maintenanceMarkedBy = actor;
    } else {
      nextData.reason = parsed.data.reason || existing.reason;
      nextData.clientFacingNote = parsed.data.clientFacingNote || existing.clientFacingNote;
      nextData.blockedBy = actor;
      nextData.isActive = true;
      nextData.unblockedAt = null;
      nextData.unblockedBy = null;
    }

    const blockedCustomer = await blockedCustomerClient.update({
      where: { id: existing.id },
      data: nextData
    });
    return NextResponse.json({ blockedCustomer });
  }

  const blockedCustomer = await blockedCustomerClient.create({
    data: markAsPotentialMaintenance
      ? {
          fullName: parsed.data.fullName || null,
          phone,
          email,
          isActive: false,
          isPotentialMaintenance: true,
          maintenanceReason: parsed.data.maintenanceReason || parsed.data.reason || null,
          maintenanceMarkedAt: new Date(),
          maintenanceMarkedBy: actor
        }
      : {
          fullName: parsed.data.fullName || null,
          phone,
          email,
          clientFacingNote: parsed.data.clientFacingNote || null,
          reason: parsed.data.reason || null,
          blockedBy: actor
        }
  });

  return NextResponse.json({ blockedCustomer });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockedCustomerClient = (prisma as any).blockedCustomer;
  if (!blockedCustomerClient) {
    return NextResponse.json(
      { error: "Blocked customers unavailable until migration runs" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (type === "maintenance") {
    await blockedCustomerClient.update({
      where: { id },
      data: {
        isPotentialMaintenance: false,
        maintenanceReason: null,
        maintenanceMarkedAt: null,
        maintenanceMarkedBy: null
      }
    });
    return NextResponse.json({ ok: true });
  }

  await blockedCustomerClient.update({
    where: { id },
    data: {
      isActive: false,
      unblockedAt: new Date(),
      unblockedBy: process.env.ADMIN_EMAIL || "admin"
    }
  });
  return NextResponse.json({ ok: true });
}
