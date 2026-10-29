import { requirePageSession } from "../../lib/page-session";
import BookingList from "../booking-list";
import { gelatinClient } from "../../lib/gelatin";
import { redirect } from "next/navigation";
import { readAlternates, returnedOffer } from "../../lib/alternates";
import { readRequestStatuses, shouldPoll } from "../../lib/status";
import StatusPoller from "../status-poller";

export const dynamic = "force-dynamic";

/**
 * The return URL registered with Gelatin. The query only picks which booking to
 * highlight, except when the organizer chose Offer on one of Gelatin's
 * alternates: then it names the lost request and the DJ, and the new booking
 * starts here.
 */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { config, bookings } = await requirePageSession();
  const params = await searchParams;
  const offer = returnedOffer(params, bookings);
  if (offer) redirect(offer);
  const gelatin = gelatinClient(config);
  // Gelatin owns the status; read it fresh so the list shows what the organizer still needs to do.
  const statuses = await readRequestStatuses(gelatin, bookings);
  const alternates = await readAlternates(gelatin, bookings, statuses);
  const event = typeof params.event === "string" ? params.event : undefined;
  const booking = event ? bookings.find((item) => item.eventId === event) : undefined;
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
      <BookingList bookings={booking ? [booking, ...bookings.filter((item) => item !== booking)] : bookings} highlight={booking?.eventId ?? null} statuses={statuses} alternates={alternates} />
    </main>
  );
}
