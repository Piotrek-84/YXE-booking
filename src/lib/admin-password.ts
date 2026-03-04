import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

const HASH_PREFIX = "scrypt";
const SCRYPT_KEYLEN = 64;

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${HASH_PREFIX}:${salt}:${derived.toString("hex")}`;
}

export async function verifyAdminPassword(password: string, passwordHash: string) {
  const [prefix, salt, hashHex] = passwordHash.split(":");
  if (!prefix || !salt || !hashHex) return false;
  if (prefix !== HASH_PREFIX) return false;

  const hashBuffer = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, hashBuffer.length)) as Buffer;
  if (derived.length !== hashBuffer.length) return false;
  return timingSafeEqual(derived, hashBuffer);
}
