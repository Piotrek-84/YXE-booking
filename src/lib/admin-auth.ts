import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminSessionValid } from "./auth";

export async function isAdminAuthorized() {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminPassword) return false;
  const cookieValue = cookies().get(ADMIN_COOKIE)?.value;
  return isAdminSessionValid(cookieValue, adminPassword);
}
