import { requirePageSession } from "../../lib/page-session";
import BookingList from "../booking-list";
import { gelatinClient } from "../../lib/gelatin";
import { readAlternates } from "../../lib/alternates";
import { confirmingSince, readRequestStatuses, shouldPoll } from "../../lib/status";
import StatusPoller from "../status-poller";
import { Steps } from "../steps";

export const dynamic = "force-dynamic";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ event?: string; confirming?: string }> }) {
  const { config, bookings, tier } = await requirePageSession();
  const light = tier === "light";
  // Gelatin owns the status; read it fresh so the list shows what the organizer still needs to do.
  const gelatin = gelatinClient(config);
  const statuses = await readRequestStatuses(gelatin, bookings);
  // A DJ who passed, or an offer that expired, leaves a slot; Gelatin says who else is open for it.
  // Light partners leave this to Gelatin's portal.
  const alternates = light ? {} : await readAlternates(gelatin, bookings, statuses);
  const { event, confirming: since } = await searchParams;
  const highlight = typeof event === "string" && bookings.some((booking) => booking.eventId === event) ? event : null;
  const current = highlight ? bookings.find((item) => item.eventId === highlight) : undefined;
  const waiting = current?.engagements.some((engagement) => statuses[engagement.requestId] === "authorization_required") ?? false;
  // Just back from one checkout for every DJ: Gelatin is placing each hold in the background.
  const confirming = Boolean(current?.eventCheckout) && confirmingSince(since);
  return (
    <main className="main">
      {/* Arriving from step 3; opened from the menu, it is just the list. */}
      {highlight && <Steps current={4} />}
      <div className="heading">
        <div>
          <h1>{highlight && !light ? (current?.eventCheckout ? "Your DJs" : "Pay for your DJs") : "Bookings sent to Gelatin"}</h1>
          <p className="subtle">{light
            ? "Each DJ is a separate offer. Payment, new prices and other DJs are all handled in Gelatin."
            : current?.eventCheckout
              ? "One card covers every DJ on this event. Gelatin holds each one separately and charges it only if that DJ accepts."
              : "Each DJ is a separate offer. Pay for each one here; if a DJ comes back with a new price, you review it in Gelatin."}</p>
        </div>
      </div>
      {highlight && !light && waiting && !current?.eventCheckout && (
        <p className="notice notice-ok" role="status" style={{ marginBottom: 16 }}>Gelatin received your request. Pay for each DJ below to send it to them.</p>
      )}
      {confirming && waiting && (
        <p className="notice notice-ok" role="status" style={{ marginBottom: 16 }}>Card saved. Gelatin is placing a hold for each DJ, which takes a few seconds.</p>
      )}
      <StatusPoller active={shouldPoll(statuses, confirming)} />
      <BookingList bookings={bookings} highlight={highlight} statuses={statuses} alternates={alternates} light={light} confirming={confirming ? highlight : null} />
      <p className="hint" style={{ marginTop: 12 }}>This list lives in a signed cookie in this browser only. Gelatin keeps the real booking status.</p>
    </main>
  );
}
