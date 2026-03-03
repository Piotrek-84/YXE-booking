export const ADMIN_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromString(value: string) {
  return textEncoder.encode(value);
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

export async function createAdminSession(password: string) {
  const issuedAt = Date.now().toString();
  const signature = await signValue(issuedAt, password);
  return `${issuedAt}.${signature}`;
}

export async function isAdminSessionValid(cookieValue: string | undefined, password: string) {
  if (!cookieValue) return false;
  const [issuedAt, signature] = cookieValue.split(".");
  if (!issuedAt || !signature) return false;
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  const ageSeconds = (Date.now() - issuedAtMs) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return false;
  const expected = await signValue(issuedAt, password);
  return timingSafeEqual(signature, expected);
}
