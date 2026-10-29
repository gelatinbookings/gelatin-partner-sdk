import "server-only";
import { z } from "zod";
import { DemoConfigError, readDemoConfig, type DemoConfig } from "./config";
import {
  clearCookies, cookieNames, hasValidSession, issueSession, readBookings, readCookie, serializeCookie, writeBookings, type DemoBooking,
} from "./cookies";
import { PartnerApiError } from "@gelatinbookings/partner-sdk/server";
import { approvedLaunchUrl, describeGelatinError, gelatinClient, type GelatinClient } from "./gelatin";
import { sameSecret } from "./signed";
import { buildSubmission, demoBookingFormSchema, MAX_DEMO_DJS } from "./submission";
import { parseTier, placementFor } from "./tier";
import { checkPickedAvailability, djIdForUnavailableRequest } from "./availability";

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

/**
 * POST /api/bookings: the organizer sends step 3's offer.
 *
 * Gelatin call 2 of 5, part 2: `submitBookingRequests`. Gelatin answers with
 * one engagement per DJ. Keep `request_id` and the organizer ID with your
 * event: you need them to pay, to open Gelatin's page and to match status.
 */
export function createBookingPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let built: ReturnType<typeof buildSubmission>;
    let djNames: Map<string, string>;
    const tier = parseTier(readCookie(request.headers.get("cookie"), cookieNames(config).tier));
    try {
      const form = demoBookingFormSchema.parse(await readJson(request));
      built = buildSubmission(form, config.publicOrigin, placementFor(tier));
      djNames = new Map(form.djs.map((dj) => [dj.id.toLowerCase(), dj.name]));
    } catch (error) {
      const message = error instanceof z.ZodError ? "Check the highlighted event details." : error instanceof Error && /future|once|exist/.test(error.message) ? error.message : "Check the event details.";
      return json({ error: message }, 400);
    }

    try {
      const result = await deps.client(config).submitBookingRequests(built.submission);
      // Scaffolding: this example has no database, so it keeps the IDs in a
      // signed cookie. Your site stores them with its own event record.
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
          // Gelatin's organizer total, fees included. Show it; never compute it.
          totalCents: engagement.total_cents,
          currency: engagement.currency,
        })),
        event: {
          startsAt: built.submission.event.starts_at, endsAt: built.submission.event.ends_at, timeZone: built.submission.event.time_zone,
          venueName: built.submission.event.venue_name,
          ...(built.submission.event.venue_address ? { venueAddress: built.submission.event.venue_address } : {}),
        },
      };
      const saved = { "Set-Cookie": writeBookings(config, [booking, ...existing]) };
      const bookingsPage = `/bookings?event=${encodeURIComponent(booking.eventId)}`;
      if (tier === "full") return json({ next: bookingsPage }, 201, saved);
      // Light: straight to Gelatin's portal to take the hold. Its event page
      // lists every DJ in this booking. If the link can't be made, the
      // bookings list has "Manage in Gelatin".
      const returnUrl = new URL("/return", config.publicOrigin);
      returnUrl.searchParams.set("event", booking.eventId);
      const launch = await deps.client(config).createPortalLaunch({
        external_event_id: booking.eventId,
        external_user_id: booking.organizerId,
        resource: { kind: "request", id: booking.engagements[0].requestId },
        return_url: returnUrl.toString(),
      }).catch(() => null);
      const url = launch ? approvedLaunchUrl(launch.url, config.portalOrigins) : null;
      return json({ next: url ?? bookingsPage }, 201, saved);
    } catch (error) {
      const described = describeGelatinError(error);
      // A DJ was booked since the organizer picked them. Say which one, so the
      // page can offer to remove them instead of showing only an error.
      if (error instanceof PartnerApiError && error.code === "dj_unavailable") {
        const nonce = built.submission.external_event_id.replace(/^demo-evt-/, "");
        const djId = djIdForUnavailableRequest(error.externalRequestId, nonce, built.submission.requests.map((item) => ({ id: item.dj_id })));
        return json({ error: described.message, request_id: described.requestId, code: "dj_unavailable", dj_ids: djId ? [djId] : [] }, 409);
      }
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

const availabilitySchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dj_ids: z.array(z.uuid()).min(1).max(MAX_DEMO_DJS),
});

/**
 * POST /api/availability: before step 2 and 3 show, and before sending, the
 * page asks whether the picked DJs are still free on the booking's night.
 *
 * Gelatin call 1 of 5 again: `listDjs` with the same `date`. It only warns
 * early; Gelatin checks again on `submitBookingRequests`.
 */
export function createAvailabilityPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let input: z.infer<typeof availabilitySchema>;
    try { input = availabilitySchema.parse(await readJson(request)); } catch { return json({ error: "Invalid availability check." }, 400); }
    try {
      const result = await checkPickedAvailability(deps.client(config), input.date, input.dj_ids);
      return json({ unavailable: result.unavailable, complete: result.complete });
    } catch (error) {
      const described = describeGelatinError(error);
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

const genresQuerySchema = z.strictObject({ city: z.string().trim().max(100).optional() });

/**
 * GET /api/genres?city=: the City field changed, so the Genre field needs
 * that city's genres before the organizer submits.
 *
 * Gelatin call 1 of 5, part 3: `listGenres`. Only genres with DJs in that
 * city come back, so the typeahead never offers a search that finds nobody.
 * A read with no side effects, so it needs the session but no origin check.
 */
export function createGenresGet(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let city: string | undefined;
    try {
      city = genresQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)).city || undefined;
    } catch { return json({ error: "Invalid genre request." }, 400); }

    try {
      const { genres } = await deps.client(config).listGenres({ city });
      return json({ genres });
    } catch (error) {
      const described = describeGelatinError(error);
      return json({ error: described.message, request_id: described.requestId }, described.status);
    }
  };
}

const launchSchema = z.strictObject({ event_id: z.string().min(1).max(200), request_id: z.uuid() });

/**
 * POST /api/launch: the organizer clicks "Manage in Gelatin" or "Review the
 * new offer in Gelatin".
 *
 * Gelatin call 4 of 5: `createPortalLaunch`. It returns a one-use link to
 * your Gelatin booking page that expires in about 60 seconds, so create it on
 * the click and redirect straight away. Never email or store it.
 */
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
      // Only ever redirect to your own Gelatin booking page.
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
  // Sandbox only: this example refuses live keys. Your site would accept pk_live_ in production.
  publishable_key: z.string().max(500).regex(/^pk_test_[A-Za-z0-9]+$/),
});

/**
 * POST /api/payment: the organizer clicks "Pay now" for one DJ.
 *
 * Gelatin call 3 of 5: `createPaymentSession`. It starts, or resumes, the card
 * hold for the organizer's own offer and returns the values Stripe.js needs to
 * show its checkout on this page (see app/pay-button.tsx).
 *
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

const waitlistSchema = z.strictObject({
  email: z.string().trim().max(254).pipe(z.email()),
  city: z.string().trim().min(1).max(100),
});

/**
 * POST /api/city-waitlist: the organizer picked a city with no DJs and asked
 * to be told when there are some.
 *
 * Gelatin call `joinCityWaitlist`. Clicking "Notify me" is the organizer's
 * consent, so it is sent as `consent: true`. Gelatin answers `subscribed` or
 * `already_subscribed`, never the email. Don't log the address either.
 */
export function createCityWaitlistPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);

    let input: z.infer<typeof waitlistSchema>;
    try { input = waitlistSchema.parse(await readJson(request)); } catch { return json({ error: "Enter a valid email address." }, 400); }

    try {
      const result = await deps.client(config).joinCityWaitlist({ email: input.email, city: input.city, consent: true, source: "empty_state" });
      return json({ status: result.status, city: result.city.name }, result.status === "subscribed" ? 201 : 200);
    } catch (error) {
      if (error instanceof PartnerApiError && error.code === "invalid_request") return json({ error: "Gelatin couldn't save that. Check the email address and try again.", request_id: error.requestId }, 400);
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

const tierSchema = z.enum(["full", "light"]);

/**
 * POST /api/tier: the header's Light / Full switch. Only for a
 * signed-in browser on this site. The choice is a cookie so the step pages,
 * rendered on the server, can show the matching tier.
 */
export function createTierPost(deps: HandlerDeps) {
  return async (request: Request) => {
    const config = loadConfig(deps);
    if (config instanceof Response) return config;
    if (!sameOrigin(request, config)) return json({ error: "Forbidden" }, 403);
    if (!authorized(request, config)) return json({ error: "Sign in again." }, 401);
    let tier: z.infer<typeof tierSchema>;
    try { tier = tierSchema.parse((await request.formData()).get("tier")); } catch { return json({ error: "Choose Light or Full." }, 400); }
    return new Response(null, {
      status: 303,
      headers: { ...NO_STORE, Location: new URL("/", config.publicOrigin).toString(), "Set-Cookie": serializeCookie(config, cookieNames(config).tier, tier, 30 * 86_400) },
    });
  };
}
