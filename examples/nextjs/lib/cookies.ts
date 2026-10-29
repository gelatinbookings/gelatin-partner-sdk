import { randomUUID } from "node:crypto";
import type { DemoConfig } from "./config";
import { sign, verify } from "./signed";

const SESSION_HOURS = 12;
const MAX_BOOKINGS_BYTES = 3000;

export type DemoBooking = {
  /** External event ID this demo sent to Gelatin. */
  eventId: string;
  eventName: string;
  createdAt: string;
  /** External organizer ID used for the submission; launches must reuse it. */
  organizerId: string;
  engagements: Array<{ requestId: string; djName: string; totalCents: number; currency: string }>;
  /** What this site told Gelatin about the event, for its own public event page. Absent on older cookies. */
  event?: DemoEventDetails;
};

export type DemoEventDetails = { startsAt: string; endsAt: string; timeZone: string; venueName: string; venueAddress?: string };

function isEventDetails(value: unknown): value is DemoEventDetails {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.startsAt === "string" && typeof row.endsAt === "string" && typeof row.timeZone === "string"
    && typeof row.venueName === "string" && (row.venueAddress === undefined || typeof row.venueAddress === "string");
}

function secure(config: DemoConfig) {
  return config.publicOrigin.startsWith("https:");
}

/** `__Host-` binds the cookie to this exact host over HTTPS; loopback HTTP cannot use it. */
export function cookieNames(config: DemoConfig) {
  const prefix = secure(config) ? "__Host-" : "";
  return { session: `${prefix}partner_demo_session`, bookings: `${prefix}partner_demo_bookings`, tier: `${prefix}partner_demo_tier` };
}

export function serializeCookie(config: DemoConfig, name: string, value: string, maxAgeSeconds: number) {
  return [
    `${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`,
    ...(secure(config) ? ["Secure"] : []),
  ].join("; ");
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function issueSession(config: DemoConfig, now = Date.now()) {
  const token = sign(config.sessionSecret, "session", { sid: randomUUID(), exp: now + SESSION_HOURS * 3600_000 });
  return serializeCookie(config, cookieNames(config).session, token, SESSION_HOURS * 3600);
}

export function clearCookies(config: DemoConfig) {
  const names = cookieNames(config);
  return [serializeCookie(config, names.session, "", 0), serializeCookie(config, names.bookings, "", 0)];
}

export function hasValidSession(config: DemoConfig, token: string | null | undefined, now = Date.now()): boolean {
  const value = verify(config.sessionSecret, "session", token);
  if (!value || typeof value !== "object") return false;
  const { sid, exp } = value as Record<string, unknown>;
  return typeof sid === "string" && typeof exp === "number" && exp > now;
}

function isBooking(value: unknown): value is DemoBooking {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.eventId === "string" && typeof row.eventName === "string"
    && typeof row.createdAt === "string" && typeof row.organizerId === "string"
    && (row.event === undefined || isEventDetails(row.event))
    && Array.isArray(row.engagements) && row.engagements.every((item) => {
      const engagement = item as Record<string, unknown>;
      return engagement && typeof engagement.requestId === "string" && typeof engagement.djName === "string"
        && typeof engagement.totalCents === "number" && typeof engagement.currency === "string";
    });
}

export function readBookings(config: DemoConfig, token: string | null | undefined): DemoBooking[] {
  const value = verify(config.sessionSecret, "bookings", token);
  return Array.isArray(value) ? value.filter(isBooking) : [];
}

/** Newest first; the oldest entries fall off so the cookie stays under browser limits. */
export function writeBookings(config: DemoConfig, bookings: DemoBooking[]) {
  let kept = bookings.slice(0, 10);
  let token = sign(config.sessionSecret, "bookings", kept);
  while (token.length > MAX_BOOKINGS_BYTES && kept.length > 1) {
    kept = kept.slice(0, -1);
    token = sign(config.sessionSecret, "bookings", kept);
  }
  return serializeCookie(config, cookieNames(config).bookings, token, 30 * 24 * 3600);
}
