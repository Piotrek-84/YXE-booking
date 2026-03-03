import { prisma } from "./prisma";

type DiscountCodeCapabilities = {
  hasDiscountCodes: boolean;
};

let cached: { value: DiscountCodeCapabilities; expiresAt: number } | null = null;

export async function getDiscountCodeCapabilities(): Promise<DiscountCodeCapabilities> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'DiscountCode'
        AND column_name IN ('code', 'discountType', 'isActive')
    `;

    const present = new Set(rows.map((row) => String(row.column_name)));
    const value = {
      hasDiscountCodes:
        present.has("code") && present.has("discountType") && present.has("isActive"),
    };
    cached = { value, expiresAt: now + 60_000 };
    return value;
  } catch {
    const value = { hasDiscountCodes: false };
    cached = { value, expiresAt: now + 10_000 };
    return value;
  }
}
