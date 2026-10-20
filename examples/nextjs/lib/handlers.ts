import "server-only";
import { z } from "zod";
import { DemoConfigError, readDemoConfig, type DemoConfig } from "./config";
import {
  clearCookies, cookieNames, hasValidSession, issueSession, readBookings, readCookie, writeBookings, type DemoBooking,
} from "./cookies";
import { PartnerApiError } from "@gelatinbookings/partner-sdk/server";
import { approvedLaunchUrl, describeGelatinError, gelatinClient, type GelatinClient } from "./gelatin";
import { sameSecret } from "./signed";
import { buildSubmission, demoBookingFormSchema } from "./submission";

export type HandlerDeps = {
  config: () => DemoConfig;
  client: (config: DemoConfig) => GelatinClient;
  /** Returns false once a caller has used its allowance. Process-local and best effort. */
  allowLogin: (key: string) => boolean;
};

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const MAX_JSON_BYTES = 16 * 1024;

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  const headers = new Headers({ ...NO_STORE, ...extra });
  return Response.json(body, { status, headers });
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ ...NO_STORE, Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/** Browser mutations must come from this site's own pages. */
function sameOrigin(request: Request, config: DemoConfig) {
  return request.headers.get("origin") === config.publicOrigin;
}

function loadConfig(deps: HandlerDeps): DemoConfig | Response {
  try { return deps.config(); } catch (error) {
    if (error instanceof DemoConfigError) console.error(error.message);
    return json({ error: "The demo partner is not configured." }, 503);
  }
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new Error("Body too large");
  return JSON.parse(text);
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function createLoginPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!deps.allowLogin(clientKey(request))) return redirect("/login?error=limit");
    let password = "";
    try {
      const form = await request.formData();
      const value = form.get("password");
      password = typeof value === "string" ? value.slice(0, 200) : "";
    } catch { /* treated as a wrong password */ }
    if (!password || !sameSecret(password, config.accessPassword)) return redirect("/login?error=1");
    return redirect("/", [issueSession(config)]);
  };
}

export function createLogoutPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    return redirect("/login", clearCookies(config));
  };
}

function authorized(request: Request, config: DemoConfig) {
  return hasValidSession(config, readCookie(request.headers.get("cookie"), cookieNames(config).session));
}

export function createBookingPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let built: ReturnType<typeof buildSubmission>;
    let djNames: Map<string, string>;
    try {
      const form = demoBookingFormSchema.parse(await readJson(request));
      built = buildSubmission(form, config.publicOrigin);
      djNames = new Map(form.djs.map((dj) => [dj.id.toLowerCase(), dj.name]));
    } catch (error) {
      const message = error instanceof z.ZodError ? "Check the highlighted event details." : error instanceof Error && /future|once|exist/.test(error.message) ? error.message : "Check the event details.";
      return json({ error: message }, 400);
    }

    try {
      const result = await deps.client(config).submitBookingRequests(built.submission);
      const cookieName = cookieNames(config).bookings;
      const existing = readBookings(config, readCookie(request.headers.get("cookie"), cookieName))
        .filter((booking) => booking.eventId !== built.submission.external_event_id);
      const booking: DemoBooking = {
        eventId: built.submission.external_event_id,
        eventName: built.submission.event.name,
        createdAt: new Date().toISOString(),
        organizerId: built.submission.organizer.external_user_id,
        engagements: result.engagements.map((engagement) => ({
          requestId: engagement.request_id,
          djName: djNames.get(engagement.dj_id.toLowerCase()) ?? "DJ",
          totalCents: engagement.total_cents,
          currency: engagement.currency,
        })),
      };
      return json({ next: `/bookings?event=${encodeURIComponent(booking.eventId)}` }, 201, {
        "Set-Cookie": writeBookings(config, [booking, ...existing]),
      });
    } catch (error) {
      const described = describeGelatinError(error);
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

const launchSchema = z.strictObject({ event_id: z.string().min(1).max(200), request_id: z.uuid() });

export function createLaunchPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let input: z.infer<typeof launchSchema>;
    try { input = launchSchema.parse(await readJson(request)); } catch { return json({ error: "Invalid launch request." }, 400); }
    // Only bookings this browser submitted can be opened, with the organizer they were sent as.
    const booking = readBookings(config, readCookie(request.headers.get("cookie"), cookieNames(config).bookings))
      .find((item) => item.eventId === input.event_id);
    if (!booking || !booking.engagements.some((engagement) => engagement.requestId === input.request_id)) {
      return json({ error: "That booking is not in this browser's list." }, 404);
    }

    const returnUrl = new URL("/return", config.publicOrigin);
    returnUrl.searchParams.set("event", booking.eventId);
    try {
      const launch = await deps.client(config).createPortalLaunch({
        external_event_id: booking.eventId,
        external_user_id: booking.organizerId,
        resource: { kind: "request", id: input.request_id },
        return_url: returnUrl.toString(),
      });
      const url = approvedLaunchUrl(launch.url, config.portalOrigins);
      if (!url) {
        console.error("Refused a Gelatin launch URL outside GELATIN_PORTAL_ORIGINS");
        return json({ error: "Gelatin returned an unexpected address. Check GELATIN_PORTAL_ORIGINS." }, 502);
      }
      return json({ url });
    } catch (error) {
      const described = describeGelatinError(error);
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

const paymentSessionShape = z.object({
  // URL-encoded by Stripe, so `%` appears.
  client_secret: z.string().max(1000).regex(/^cs_test_[A-Za-z0-9_%]+$/),
  // Staging only: a live key would mean live money.
  publishable_key: z.string().max(500).regex(/^pk_test_[A-Za-z0-9]+$/),
});

/**
 * Start (or resume) the card hold for one DJ on this page. The client secret
 * opens only that Stripe checkout, so it goes to this organizer's browser and
 * nowhere else. Paying here doesn't confirm anything by itself: the bookings
 * page reads the status Gelatin records once Stripe confirms the hold.
 */
export function createPaymentPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let input: z.infer<typeof launchSchema>;
    try { input = launchSchema.parse(await readJson(request)); } catch { return json({ error: "Invalid payment request." }, 400); }
    const booking = readBookings(config, readCookie(request.headers.get("cookie"), cookieNames(config).bookings))
      .find((item) => item.eventId === input.event_id);
    if (!booking || !booking.engagements.some((engagement) => engagement.requestId === input.request_id)) {
      return json({ error: "That booking is not in this browser's list." }, 404);
    }

    try {
      const session = await deps.client(config).createPaymentSession({
        external_event_id: booking.eventId,
        external_user_id: booking.organizerId,
        resource: { kind: "request", id: input.request_id },
      });
      const checked = paymentSessionShape.safeParse(session);
      if (!checked.success) {
        console.error("Refused a Gelatin payment session that is not a test-mode embedded checkout");
        return json({ error: "Gelatin returned an unexpected payment session." }, 502);
      }
      return json({ client_secret: checked.data.client_secret, publishable_key: checked.data.publishable_key });
    } catch (error) {
      // A DJ's counteroffer, or a hold started elsewhere, is finished in Gelatin.
      if (error instanceof PartnerApiError && error.code === "portal_required") return json({ portal: true }, 409);
      const described = describeGelatinError(error);
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

/** Five attempts per caller per ten minutes, held in this server instance's memory. */
export function memoryLoginLimiter(limit = 5, windowMs = 10 * 60_000, now = () => Date.now()) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const at = now();
    const recent = (hits.get(key) ?? []).filter((time) => at - time < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(at);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  };
}

export const defaultDeps: HandlerDeps = {
  config: () => readDemoConfig(),
  client: gelatinClient,
  allowLogin: memoryLoginLimiter(),
};
