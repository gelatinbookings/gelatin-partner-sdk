import { createHmac } from "node:crypto";

/**
 * Server-only demo partner configuration. Every value except DEMO_SESSION_SECRET is required; a missing
 * or malformed value fails closed and names only the variable, never a value.
 * The demo is a staging (test-mode) partner only, so live keys are refused.
 */
export type DemoMode = "test";

export type DemoConfig = {
  /** Gelatin deployment origin, for example https://staging.gelatinbookings.com. */
  apiOrigin: string;
  partnerSlug: string;
  partnerKey: string;
  mode: DemoMode;
  accessPassword: string;
  sessionSecret: string;
  /** This demo site's own public origin; return URLs are built from it, never from Host. */
  publicOrigin: string;
  /** Origins Gelatin may send launch URLs for. Anything else is refused. */
  portalOrigins: ReadonlySet<string>;
};

export class DemoConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`Demo partner is not configured: ${variables.join(", ")}`);
    this.name = "DemoConfigError";
  }
}

type Env = Record<string, string | undefined>;

function isLoopback(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Exact origin only: https, or http on loopback for local development. */
export function parseOrigin(value: string, { allowLoopback }: { allowLoopback: boolean }): string {
  const url = new URL(value);
  const local = url.protocol === "http:" && isLoopback(url.hostname);
  if (url.protocol !== "https:" && !(local && allowLoopback)) throw new Error("Origin must use HTTPS");
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Origin must not include a path, credentials, query or fragment");
  }
  return url.origin;
}

export function readDemoConfig(env: Env = process.env): DemoConfig {
  const bad: string[] = [];
  const text = (name: string, test: (value: string) => boolean) => {
    const value = env[name]?.trim();
    if (!value || !test(value)) { bad.push(name); return ""; }
    return value;
  };

  // Staging only: a gel_live_ key would create real bookings and charges, so it is refused.
  const partnerKey = text("GELATIN_PARTNER_KEY", (value) => /^gel_test_[A-Za-z0-9_-]{16,}$/.test(value));
  const mode: DemoMode = "test";
  const allowLoopback = true;
  const origin = (name: string) => text(name, (value) => {
    try { parseOrigin(value, { allowLoopback }); return true; } catch { return false; }
  });

  const apiOrigin = origin("GELATIN_API_BASE_URL");
  const partnerSlug = text("GELATIN_PARTNER_SLUG", (value) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(value));
  const accessPassword = text("DEMO_ACCESS_PASSWORD", (value) => value.length >= 12 && value.length <= 200);
  // Optional. Every server instance must sign cookies with the same secret, so
  // when none is set it is derived from the partner key: stable across deploys,
  // and replacing the key signs everyone out once.
  const configuredSecret = env.DEMO_SESSION_SECRET?.trim()
    ? text("DEMO_SESSION_SECRET", (value) => value.length >= 32 && value.length <= 4096)
    : "";
  const publicOrigin = origin("DEMO_PUBLIC_ORIGIN");
  const portalList = text("GELATIN_PORTAL_ORIGINS", (value) => {
    const items = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (items.length === 0 || items.length > 10) return false;
    try { items.forEach((item) => parseOrigin(item, { allowLoopback })); return true; } catch { return false; }
  });

  if (bad.length) throw new DemoConfigError(bad);
  return {
    apiOrigin: parseOrigin(apiOrigin, { allowLoopback }),
    partnerSlug,
    partnerKey,
    mode,
    accessPassword,
    sessionSecret: configuredSecret || createHmac("sha256", partnerKey).update("partner-demo:session-secret:v1").digest("base64url"),
    publicOrigin: parseOrigin(publicOrigin, { allowLoopback }),
    portalOrigins: new Set(portalList.split(",").map((item) => item.trim()).filter(Boolean)
      .map((item) => parseOrigin(item, { allowLoopback }))),
  };
}
