import { requirePageSession } from "../../lib/page-session";
import BookingList from "../booking-list";
import { gelatinClient } from "../../lib/gelatin";
import { readRequestStatuses, shouldPoll } from "../../lib/status";
import StatusPoller from "../status-poller";

export const dynamic = "force-dynamic";

/** The return URL registered with Gelatin. The query only picks which booking to highlight. */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { config, bookings } = await requirePageSession();
  // Gelatin owns the status; read it fresh so the list shows what the organizer still needs to do.
  const statuses = await readRequestStatuses(gelatinClient(config), bookings);
  const { event } = await searchParams;
  const booking = typeof event === "string" ? bookings.find((item) => item.eventId === event) : undefined;
  return (
    <main className="main">
      <div className="heading">
        <div>
          <p className="eyebrow">Back from Gelatin</p>
          <h1>{booking ? booking.eventName : "Welcome back"}</h1>
          <p className="subtle">Gelatin sent you back to this partner site. Payment and DJ replies continue in Gelatin and by email.</p>
        </div>
      </div>
      {!booking && event && <p className="notice notice-info" style={{ marginBottom: 16 }}>That event is not in this browser&apos;s list.</p>}
      <StatusPoller active={shouldPoll(statuses)} />
      <BookingList bookings={booking ? [booking, ...bookings.filter((item) => item !== booking)] : bookings} highlight={booking?.eventId ?? null} statuses={statuses} />
    </main>
  );
}
