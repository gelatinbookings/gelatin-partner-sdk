import { requirePageSession } from "../../lib/page-session";
import EventForm from "./event-form";
import { Steps } from "../steps";

export const dynamic = "force-dynamic";

/** Step 2: the event itself. The date was fixed in step 1. */
export default async function EventPage() {
  await requirePageSession();
  return (
    <main className="main main-narrow">
      <Steps current={2} />
      <div className="heading">
        <div>
          <h1>Tell us about the event</h1>
          <p className="subtle">Gelatin sends the organizer payment and booking emails, so use an address you can read.</p>
        </div>
      </div>
      <EventForm />
    </main>
  );
}
