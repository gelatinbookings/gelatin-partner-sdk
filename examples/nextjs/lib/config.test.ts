import { describe, expect, it } from "vitest";
import { DemoConfigError, readDemoConfig } from "./config";

const env = {
  GELATIN_API_BASE_URL: "https://staging.gelatinbookings.com",
  GELATIN_PARTNER_SLUG: "gelatin-demo",
  GELATIN_PARTNER_KEY: "gel_test_abcdefghijklmnopqrstuvwxyz",
  DEMO_ACCESS_PASSWORD: "correct horse battery",
  DEMO_SESSION_SECRET: "s".repeat(48),
  DEMO_PUBLIC_ORIGIN: "https://partner-demo.staging.gelatinbookings.com",
  GELATIN_PORTAL_ORIGINS: "https://book-demo.staging.gelatinbookings.com, http://127.0.0.1:3000",
};

describe("demo partner configuration", () => {
  it("reads a complete staging configuration", () => {
    const config = readDemoConfig(env);
    expect(config.mode).toBe("test");
    expect(config.apiOrigin).toBe("https://staging.gelatinbookings.com");
    expect([...config.portalOrigins]).toEqual(["https://book-demo.staging.gelatinbookings.com", "http://127.0.0.1:3000"]);
  });

  it("fails closed and names every missing or malformed variable without echoing values", () => {
    let thrown: unknown;
    try {
      readDemoConfig({ ...env, GELATIN_PARTNER_KEY: "not-a-key-secret-value", DEMO_SESSION_SECRET: "short", DEMO_PUBLIC_ORIGIN: undefined });
    } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(DemoConfigError);
    expect((thrown as DemoConfigError).variables.sort()).toEqual(["DEMO_PUBLIC_ORIGIN", "DEMO_SESSION_SECRET", "GELATIN_PARTNER_KEY"]);
    expect((thrown as Error).message).not.toContain("not-a-key-secret-value");
  });

  it("derives a stable session secret from the partner key when DEMO_SESSION_SECRET is unset", () => {
    const { DEMO_SESSION_SECRET: _unset, ...withoutSecret } = env;
    const first = readDemoConfig(withoutSecret).sessionSecret;
    // Every server instance and deploy with the same key must sign and verify the same cookies.
    expect(readDemoConfig(withoutSecret).sessionSecret).toBe(first);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toContain(env.GELATIN_PARTNER_KEY);
    // A new key gives a new secret, so replacing the key signs everyone out once.
    expect(readDemoConfig({ ...withoutSecret, GELATIN_PARTNER_KEY: "gel_test_zyxwvutsrqponmlkjihgfedcba" }).sessionSecret).not.toBe(first);
    expect(readDemoConfig({ ...withoutSecret, DEMO_SESSION_SECRET: "" }).sessionSecret).toBe(first);
  });

  it("uses DEMO_SESSION_SECRET when it is set, and still rejects a short one", () => {
    expect(readDemoConfig(env).sessionSecret).toBe("s".repeat(48));
    expect(() => readDemoConfig({ ...env, DEMO_SESSION_SECRET: "short" })).toThrow(DemoConfigError);
  });

  it("rejects origins with paths, credentials or plain HTTP outside loopback", () => {
    expect(() => readDemoConfig({ ...env, GELATIN_API_BASE_URL: "https://staging.gelatinbookings.com/v1" })).toThrow(DemoConfigError);
    expect(() => readDemoConfig({ ...env, GELATIN_PORTAL_ORIGINS: "https://user:pw@book-demo.staging.gelatinbookings.com" })).toThrow(DemoConfigError);
    expect(() => readDemoConfig({ ...env, DEMO_PUBLIC_ORIGIN: "http://partner-demo.staging.gelatinbookings.com" })).toThrow(DemoConfigError);
    expect(readDemoConfig({ ...env, DEMO_PUBLIC_ORIGIN: "http://127.0.0.1:3100" }).publicOrigin).toBe("http://127.0.0.1:3100");
  });

  it("refuses a live key, because the demo is a staging test-mode partner only", () => {
    let thrown: unknown;
    try { readDemoConfig({ ...env, GELATIN_PARTNER_KEY: "gel_live_abcdefghijklmnopqrstuvwxyz" }); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(DemoConfigError);
    expect((thrown as DemoConfigError).variables).toEqual(["GELATIN_PARTNER_KEY"]);
  });
});
