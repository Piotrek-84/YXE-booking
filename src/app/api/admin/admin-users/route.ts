import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdminSession, isMasterAdmin } from "../../../../lib/admin-auth";
import { hashAdminPassword } from "../../../../lib/admin-password";
import { getMasterAdminLogin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const createSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().max(120).optional(),
});

const updateSchema = z.object({
  id: z.string().min(3),
  login: z.string().trim().min(3).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
  fullName: z.string().trim().max(120).optional(),
  isActive: z.boolean().optional(),
});

const removeSchema = z.object({
  id: z.string().min(3),
});

async function ensureMaster() {
  const isMaster = await isMasterAdmin();
  if (!isMaster) {
    return NextResponse.json(
      { error: "Only the master admin can manage admin access." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const forbidden = await ensureMaster();
  if (forbidden) return forbidden;

  const users = await prisma.adminUser.findMany({
    orderBy: [{ isActive: "desc" }, { login: "asc" }],
    select: {
      id: true,
      login: true,
      fullName: true,
      isActive: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    masterLogin: getMasterAdminLogin(),
    users,
  });
}

export async function POST(request: Request) {
  const forbidden = await ensureMaster();
  if (forbidden) return forbidden;

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const login = parsed.data.login.toLowerCase();
  if (login === getMasterAdminLogin()) {
    return NextResponse.json(
      { error: "That login is reserved for the master admin." },
      { status: 400 }
    );
  }

  const passwordHash = await hashAdminPassword(parsed.data.password);
  const actor = (await getCurrentAdminSession())?.login || getMasterAdminLogin();

  try {
    const user = await prisma.adminUser.create({
      data: {
        login,
        passwordHash,
        fullName: parsed.data.fullName || null,
        isActive: true,
        createdBy: actor,
      },
      select: {
        id: true,
        login: true,
        fullName: true,
        isActive: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That login already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create admin user." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const forbidden = await ensureMaster();
  if (forbidden) return forbidden;

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const data: {
    login?: string;
    passwordHash?: string;
    fullName?: string | null;
    isActive?: boolean;
  } = {};

  if (parsed.data.login !== undefined) {
    const login = parsed.data.login.toLowerCase();
    if (login === getMasterAdminLogin()) {
      return NextResponse.json(
        { error: "That login is reserved for the master admin." },
        { status: 400 }
      );
    }
    data.login = login;
  }

  if (parsed.data.password) {
    data.passwordHash = await hashAdminPassword(parsed.data.password);
  }
  if (parsed.data.fullName !== undefined) {
    data.fullName = parsed.data.fullName || null;
  }
  if (parsed.data.isActive !== undefined) {
    data.isActive = parsed.data.isActive;
  }

  try {
    const user = await prisma.adminUser.update({
      where: { id: parsed.data.id },
      data,
      select: {
        id: true,
        login: true,
        fullName: true,
        isActive: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That login already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update admin user." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const forbidden = await ensureMaster();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(request.url);
  const parsed = removeSchema.safeParse({
    id: searchParams.get("id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await prisma.adminUser.delete({
    where: { id: parsed.data.id },
  });

  return NextResponse.json({ ok: true });
}
