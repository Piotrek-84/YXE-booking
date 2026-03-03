import { prisma } from "./prisma";

const REQUIRED_MAINTENANCE_COLUMNS = [
  "isPotentialMaintenance",
  "maintenanceReason",
  "maintenanceMarkedAt",
  "maintenanceMarkedBy"
] as const;

type BlockedCustomerCapabilities = {
  hasMaintenanceFields: boolean;
};

let cached: { value: BlockedCustomerCapabilities; expiresAt: number } | null = null;

export async function getBlockedCustomerCapabilities(): Promise<BlockedCustomerCapabilities> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'BlockedCustomer'
        AND column_name IN (${REQUIRED_MAINTENANCE_COLUMNS[0]}, ${REQUIRED_MAINTENANCE_COLUMNS[1]}, ${REQUIRED_MAINTENANCE_COLUMNS[2]}, ${REQUIRED_MAINTENANCE_COLUMNS[3]})
    `;

    const present = new Set(rows.map((row) => String(row.column_name)));
    const value = {
      hasMaintenanceFields: REQUIRED_MAINTENANCE_COLUMNS.every((column) => present.has(column))
    };
    cached = { value, expiresAt: now + 60_000 };
    return value;
  } catch {
    const value = { hasMaintenanceFields: false };
    cached = { value, expiresAt: now + 10_000 };
    return value;
  }
}
