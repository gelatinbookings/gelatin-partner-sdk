// The four-call journey from the README, typechecked against the SDK.
// Run with: GELATIN_API_BASE=… GELATIN_API_KEY=gel_test_… npx tsx examples/quickstart.ts
import { createPartnerClient, PartnerApiError } from "../src/server.js";

const gelatin = createPartnerClient({
  baseUrl: process.env.GELATIN_API_BASE!,
  apiKey: process.env.GELATIN_API_KEY!,
});

const returnUrl = process.env.RETURN_URL ?? "https://your-site.example/events/event_123";

try {
  // 1. List DJs. Pass the event date to get availability.
  const page = await gelatin.listDjs({ city: "Atlanta", date: "2026-11-14", limit: 20 });
  const dj = page.items.find((item) => item.available);
  if (!dj) throw new Error("No available DJs in the sandbox for that date");

  // 2. Send the organizer's booking request, one entry per DJ.
  const id = Date.now().toString(36);
  const booking = await gelatin.submitBookingRequests({
    external_booking_id: `booking_${id}`,
    external_submission_id: `submission_${id}`,
    external_event_id: `event_${id}`,
    organizer: { external_user_id: "user_7", email: "organizer@example.com", display_name: "Sam Rivera" },
    event: {
      name: "Friday Social",
      starts_at: "2026-11-14T22:00:00-05:00",
      ends_at: "2026-11-15T02:00:00-05:00",
      time_zone: "America/New_York",
      venue_name: "The Warehouse",
    },
    requests: [{ external_request_id: `req_${id}`, dj_id: dj.id, initial_offer: { currency: "usd", dj_fee_cents: 30000 } }],
    authorization_placement: "gelatin_portal_handoff",
    return_url: returnUrl,
  });

  // 3. A one-use link to Gelatin's booking page, valid for 60 seconds.
  const launch = await gelatin.createPortalLaunch({
    external_event_id: `event_${id}`,
    external_user_id: "user_7",
    resource: { kind: "request", id: booking.engagements[0].request_id },
    return_url: returnUrl,
  });
  console.log("Open within 60 s:", launch.url);

  // 4. Read status by your own event ID.
  const status = await gelatin.getEventBookings(`event_${id}`);
  if (status.modified) console.log(JSON.stringify(status.data, null, 2));
} catch (error) {
  if (error instanceof PartnerApiError) console.error(error.status, error.code, error.requestId);
  throw error;
}
