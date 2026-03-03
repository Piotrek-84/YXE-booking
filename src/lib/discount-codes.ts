export type DiscountRule = {
  discountType: "PERCENTAGE" | "FIXED_CENTS";
  percentOff?: number | null;
  fixedAmountCents?: number | null;
};

export function normalizeDiscountCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isDiscountCodeFormatValid(value: string) {
  return /^[A-Z0-9_-]{3,32}$/.test(value);
}

export function computeDiscountAmountCents(subtotalCents: number, rule: DiscountRule) {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;

  if (rule.discountType === "PERCENTAGE") {
    const percent = Number(rule.percentOff || 0);
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    const amount = Math.round(subtotalCents * (percent / 100));
    return Math.max(0, Math.min(subtotalCents, amount));
  }

  const fixed = Number(rule.fixedAmountCents || 0);
  if (!Number.isFinite(fixed) || fixed <= 0) return 0;
  return Math.max(0, Math.min(subtotalCents, Math.round(fixed)));
}

export function getDiscountDisplayValue(rule: DiscountRule) {
  if (rule.discountType === "PERCENTAGE") {
    return `${rule.percentOff || 0}% off`;
  }
  const cents = Number(rule.fixedAmountCents || 0);
  return `$${(cents / 100).toFixed(2)} off`;
}
