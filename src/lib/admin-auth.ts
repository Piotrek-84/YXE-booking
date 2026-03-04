import { cookies } from "next/headers";
import { ADMIN_COOKIE, getAdminSession } from "./auth";

export async function isAdminAuthorized() {
  const cookieValue = cookies().get(ADMIN_COOKIE)?.value;
  return !!(await getAdminSession(cookieValue));
}

export async function getCurrentAdminSession() {
  const cookieValue = cookies().get(ADMIN_COOKIE)?.value;
  return getAdminSession(cookieValue);
}

export async function isMasterAdmin() {
  const session = await getCurrentAdminSession();
  return session?.role === "MASTER";
}
