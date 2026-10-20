import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-signed, base64url JSON. Contents are integrity-protected, not secret. */
export function sign(secret: string, purpose: string, value: unknown): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${mac(secret, purpose, body)}`;
}

export function verify(secret: string, purpose: string, token: string | undefined | null): unknown {
  if (!token || token.length > 8192) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(secret, purpose, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
}

function mac(secret: string, purpose: string, body: string) {
  return createHmac("sha256", secret).update(`partner-demo:${purpose}:v1:${body}`).digest("base64url");
}

/** Constant-time comparison of two strings of any length. */
export function sameSecret(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
