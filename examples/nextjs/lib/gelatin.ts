import "server-only";
import { createPartnerClient, PartnerApiError } from "@gelatinbookings/partner-sdk/server";
import type { DemoConfig } from "./config";

export type GelatinClient = ReturnType<typeof createPartnerClient>;

/**
 * The one SDK client this site uses. It's server-only: `server-only` above
 * makes the build fail if a browser component imports this file, so the API
 * key can never reach the browser.
 *
 * `baseUrl` is Gelatin's origin plus your partner slug. The client adds the
 * key, idempotency keys, timeouts and safe retries to every call.
 */
export function gelatinClient(config: DemoConfig): GelatinClient {
  return createPartnerClient({
    baseUrl: `${config.apiOrigin}/v1/partners/${config.partnerSlug}`,
    apiKey: config.partnerKey,
  });
}

/**
 * Check a `createPortalLaunch` URL before redirecting to it.
 * Accept only Gelatin's portal launch shape on an approved origin, so a
 * compromised or misconfigured response can never send the organizer elsewhere.
 */
export function approvedLaunchUrl(value: string, portalOrigins: ReadonlySet<string>): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.username || url.password || url.search) return null;
  if (!portalOrigins.has(url.origin) || url.pathname !== "/partner/launch") return null;
  if (!/^#token=[A-Za-z0-9_-]{16,512}$/.test(url.hash)) return null;
  return url.toString();
}

const MESSAGES: Record<string, string> = {
  invalid_request: "Gelatin rejected the request. Check the event details and try again.",
  forbidden_scope: "This demo's API key is missing a required scope.",
  unauthorized: "Gelatin did not accept this demo's API key.",
  conflict: "This form was already sent with different details. Reload the page to start a new booking.",
  idempotency_conflict: "That launch was already requested. Try again.",
  dj_unavailable: "One of the DJs you picked isn't available for this event. Choose another DJ or change the date, then send it again.",
  not_found: "Gelatin could not find that DJ or booking.",
  resource_unavailable: "Gelatin could not find that booking for this organizer.",
  unsupported_authorization_placement: "Gelatin only supports payment through its portal for now.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  request_active: "That DJ's request is still open, so there is nothing to replace yet.",
};

/**
 * Every SDK call throws `PartnerApiError` on failure, with a stable `code`
 * (see the SDK README's error table) and Gelatin's `requestId`. Show a short
 * message and keep the request ID for support; never show the raw response.
 */
export function describeGelatinError(error: unknown): { message: string; requestId: string | null; status: number } {
  if (error instanceof PartnerApiError) {
    const message = MESSAGES[error.code]
      ?? (error.status === 401 ? MESSAGES.unauthorized : error.status === 429 ? MESSAGES.rate_limited
        // 503 now means only an outage; an unavailable DJ is 409 dj_unavailable.
        : "Gelatin is unavailable right now. Try again shortly.");
    return { message, requestId: error.requestId, status: error.status >= 500 ? 502 : error.status };
  }
  return { message: "Gelatin is unavailable right now. Try again shortly.", requestId: null, status: 502 };
}
