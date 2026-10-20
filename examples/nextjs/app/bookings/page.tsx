import { requirePageSession } from "../../lib/page-session";
import BookingList from "../booking-list";
import { gelatinClient } from "../../lib/gelatin";
import { readRequestStatuses, shouldPoll } from "../../lib/status";
import StatusPoller from "../status-poller";
import { Steps } from "../steps";

export const dynamic = "force-dynamic";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { config, bookings } = await requirePageSession();
  // Gelatin owns the status; read it fresh so the list shows what the organizer still needs to do.
  const statuses = await readRequestStatuses(gelatinClient(config), bookings);
  const { event } = await searchParams;
  const highlight = typeof event === "string" && bookings.some((booking) => booking.eventId === event) ? event : null;
  return (
    <main className="main">
      {/* Arriving from step 3; opened from the menu, it is just the list. */}
      {highlight && <Steps current={4} />}
      <div className="heading">
        <div>
          <h1>{highlight ? "Pay for your DJs" : "Bookings sent to Gelatin"}</h1>
          <p className="subtle">Each DJ is a separate offer. Pay for each one here; if a DJ comes back with a new price, you review it in Gelatin.</p>
        </div>
      </div>
      {highlight && bookings.find((item) => item.eventId === highlight)?.engagements.some((engagement) => statuses[engagement.requestId] === "authorization_required") && (
        <p className="notice notice-ok" role="status" style={{ marginBottom: 16 }}>Gelatin received your request. Pay for each DJ below to send it to them.</p>
      )}
      <StatusPoller active={shouldPoll(statuses)} />
      <BookingList bookings={bookings} highlight={highlight} statuses={statuses} />
      <p className="hint" style={{ marginTop: 12 }}>This list lives in a signed cookie in this browser only. Gelatin keeps the real booking status.</p>
    </main>
  );
}
