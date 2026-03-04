export const ADMIN_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const textEncoder = new TextEncoder();

export type AdminRole = "MASTER" | "ADMIN";

export type AdminSession = {
  login: string;
  role: AdminRole;
  issuedAt: number;
};

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function fromString(value: string) {
  return textEncoder.encode(value);
}

function decodeBytes(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signValue(value: string, secret: string) {
  if (globalThis.crypto?.subtle) {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      fromString(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await globalThis.crypto.subtle.sign("HMAC", key, fromString(value));
    return toBase64Url(new Uint8Array(signature));
  }

  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", secret).update(value).digest();
  return toBase64Url(new Uint8Array(signature));
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

export function getMasterAdminLogin() {
  return (
    process.env.ADMIN_LOGIN?.trim().toLowerCase() ||
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
    "master"
  );
}

export async function createAdminSession(payload: { login: string; role: AdminRole }) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Session secret is not configured.");
  }

  const body = {
    login: payload.login.trim().toLowerCase(),
    role: payload.role,
    issuedAt: Date.now(),
  } satisfies AdminSession;
  const encodedBody = toBase64Url(fromString(JSON.stringify(body)));
  const signature = await signValue(encodedBody, secret);
  return `${encodedBody}.${signature}`;
}

export async function getAdminSession(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  const [encodedBody, signature] = cookieValue.split(".");
  if (!encodedBody || !signature) return null;

  const secret = getSessionSecret();
  if (!secret) return null;

  const expected = await signValue(encodedBody, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  let payload: AdminSession | null = null;
  try {
    const raw = decodeBytes(fromBase64Url(encodedBody));
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (
      parsed &&
      (parsed.role === "MASTER" || parsed.role === "ADMIN") &&
      typeof parsed.login === "string" &&
      typeof parsed.issuedAt === "number"
    ) {
      payload = {
        login: parsed.login.trim().toLowerCase(),
        role: parsed.role,
        issuedAt: parsed.issuedAt,
      };
    }
  } catch {
    payload = null;
  }
  if (!payload) return null;

  const issuedAtMs = payload.issuedAt;
  if (!Number.isFinite(issuedAtMs)) return null;
  const ageSeconds = (Date.now() - issuedAtMs) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null;

  return payload;
}

export async function isAdminSessionValid(cookieValue: string | undefined) {
  return !!(await getAdminSession(cookieValue));
}
