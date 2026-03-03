import { randomBytes } from "crypto";

export function createClientManageToken() {
  return randomBytes(24).toString("base64url");
}

export function getTokenExpiry(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
