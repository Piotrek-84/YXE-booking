import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: true,
    db: dbOk ? "up" : "down",
    timestamp: new Date().toISOString()
  });
}
