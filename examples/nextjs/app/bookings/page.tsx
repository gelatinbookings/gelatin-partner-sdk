import { requirePageSession } from "../../lib/page-session";
import BookingList from "../booking-list";
import { gelatinClient } from "../../lib/gelatin";
import { readRequestStatuses } from "../../lib/status";

export const dynamic = "force-dynamic";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { config, bookings } = await requirePageSession();
  // Gelatin owns the status; read it fresh so the list shows what the organizer still needs to do.
  const statuses = await readRequestStatuses(gelatinClient(config), bookings);
  const { event } = await searchParams;
  const highlight = typeof event === "string" && bookings.some((booking) => booking.eventId === event) ? event : null;
  return (
    <main className="main">
      <div className="heading">
        <div>
          <p className="eyebrow">Step 3 of 3</p>
          <h1>Bookings sent to Gelatin</h1>
          <p className="subtle">Each DJ is a separate offer. Open one in Gelatin to review it and place the card hold.</p>
        </div>
      </div>
      {highlight && <p className="notice notice-ok" role="status" style={{ marginBottom: 16 }}>Gelatin received your request. Authorize payment for each DJ below.</p>}
      <BookingList bookings={bookings} highlight={highlight} statuses={statuses} />
      <p className="hint" style={{ marginTop: 12 }}>This list lives in a signed cookie in this browser only. Gelatin keeps the real booking status.</p>
    </main>
  );
}
