import { EmployeeRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorized } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { syncStaffingForShiftDates } from "../../../../lib/schedule";

const listSchema = z.object({
  search: z.string().optional(),
  scope: z.enum(["active", "all"]).optional(),
});

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  scheduleName: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(160),
  role: z.nativeEnum(EmployeeRole).optional(),
});

const updateSchema = z.object({
  id: z.string().min(3),
  fullName: z.string().trim().min(2).max(120).optional(),
  scheduleName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  email: z.string().trim().email().max(160).optional(),
  role: z.nativeEnum(EmployeeRole).optional(),
  isActive: z.boolean().optional(),
});

const removeSchema = z.object({
  id: z.string().min(3),
});

function isMissingTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

const employeeRepairStatements = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "scheduleName" TEXT`,
];

async function repairEmployeeSchema() {
  for (const statement of employeeRepairStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function retryWithEmployeeRepair<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
  await repairEmployeeSchema();
  return operation();
}

async function getEmployeeShiftDates(employeeId: string) {
  const shifts = await prisma.employeeShift.findMany({
    where: { employeeId },
    select: {
      locationCode: true,
      shiftDate: true,
    },
    distinct: ["locationCode", "shiftDate"],
  });

  return shifts.map((shift) => ({
    locationCode: shift.locationCode,
    shiftDate: shift.shiftDate,
  }));
}

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = listSchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const search = parsed.data.search?.trim();
  const scope = parsed.data.scope || "all";

  let employees;
  try {
    employees = await retryWithEmployeeRepair(() =>
      prisma.employee.findMany({
        where: {
          ...(scope === "active" ? { isActive: true } : {}),
          ...(search
            ? {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { scheduleName: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ isActive: "desc" }, { role: "asc" }, { fullName: "asc" }],
      })
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not load employees." }, { status: 500 });
  }

  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const employee = await retryWithEmployeeRepair(() =>
      prisma.employee.create({
        data: {
          fullName: parsed.data.fullName,
          scheduleName: parsed.data.scheduleName || null,
          phone: parsed.data.phone,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role || "DETAILER",
        },
      })
    );

    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Schedule tables are not ready yet. Run Prisma migrations first." },
        { status: 503 }
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create employee." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const before = await retryWithEmployeeRepair(() =>
    prisma.employee.findUnique({
      where: { id: parsed.data.id },
    })
  );
  if (!before) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  try {
    const employee = await retryWithEmployeeRepair(() =>
      prisma.employee.update({
        where: { id: parsed.data.id },
        data: {
          ...(parsed.data.fullName !== undefined ? { fullName: parsed.data.fullName } : {}),
          ...(parsed.data.scheduleName !== undefined
            ? { scheduleName: parsed.data.scheduleName?.trim() || null }
            : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
          ...(parsed.data.email !== undefined ? { email: parsed.data.email.toLowerCase() } : {}),
          ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
          ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        },
      })
    );

    const roleChanged = parsed.data.role !== undefined && parsed.data.role !== before.role;
    const activeChanged =
      parsed.data.isActive !== undefined && parsed.data.isActive !== before.isActive;
    if (roleChanged || activeChanged) {
      const shiftDates = await getEmployeeShiftDates(parsed.data.id);
      await syncStaffingForShiftDates(shiftDates);
    }

    return NextResponse.json({ employee });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update employee." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = removeSchema.safeParse({
    id: searchParams.get("id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const shiftDates = await getEmployeeShiftDates(parsed.data.id);

  try {
    await prisma.employee.delete({
      where: { id: parsed.data.id },
    });
    await syncStaffingForShiftDates(shiftDates);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to remove employee." }, { status: 500 });
  }
}
