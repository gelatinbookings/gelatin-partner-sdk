import { requirePageSession } from "../../lib/page-session";
import CreatedSummary from "./created-summary";

export const dynamic = "force-dynamic";

/** The end of "Skip, no lineup right now": the event exists, and Gelatin was never called. */
export default async function CreatedPage() {
  await requirePageSession();
  return (
    <main className="main main-narrow">
      <CreatedSummary />
    </main>
  );
}
