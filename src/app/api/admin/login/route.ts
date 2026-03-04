import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPassword } from "../../../../lib/admin-password";
import { ADMIN_COOKIE, createAdminSession, getMasterAdminLogin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const loginSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(6),
});

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;
const FAILED_DELAY_MS = 600;

type AttemptState = { count: number; lockedUntil: number };
const attempts = new Map<string, AttemptState>();

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const state = attempts.get(ip);
  if (state && state.lockedUntil > now) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in about 1 minute." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const login = parsed.data.login.trim().toLowerCase();
  const password = parsed.data.password;

  if (!adminPassword) {
    return NextResponse.json({ error: "Admin credentials not configured" }, { status: 500 });
  }

  const attemptKey = `${ip}:${login}`;
  const stateForLogin = attempts.get(attemptKey);
  if (stateForLogin && stateForLogin.lockedUntil > now) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in about 1 minute." },
      { status: 429 }
    );
  }

  const masterLogin = getMasterAdminLogin();
  const isMasterLogin = login === masterLogin && password === adminPassword;

  let isSecondaryAdminLogin = false;
  if (!isMasterLogin) {
    try {
      const adminUser = await prisma.adminUser.findUnique({
        where: { login },
      });
      if (adminUser?.isActive) {
        isSecondaryAdminLogin = await verifyAdminPassword(password, adminUser.passwordHash);
      }
    } catch {
      isSecondaryAdminLogin = false;
    }
  }

  if (!isMasterLogin && !isSecondaryAdminLogin) {
    const nextCount = (state?.count ?? 0) + 1;
    const lockedUntil = nextCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : (state?.lockedUntil ?? 0);
    attempts.set(ip, { count: nextCount, lockedUntil });
    const loginCount = (stateForLogin?.count ?? 0) + 1;
    attempts.set(attemptKey, {
      count: loginCount,
      lockedUntil:
        loginCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : (stateForLogin?.lockedUntil ?? 0),
    });
    await delay(FAILED_DELAY_MS);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  attempts.delete(ip);
  attempts.delete(attemptKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: await createAdminSession({
      login,
      role: isMasterLogin ? "MASTER" : "ADMIN",
    }),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
