import { requirePageSession } from "../../lib/page-session";
import OfferForm from "./offer-form";
import { Steps } from "../steps";

export const dynamic = "force-dynamic";

/** Step 3: what each DJ is offered, then send it all to Gelatin. */
export default async function OfferPage() {
  await requirePageSession();
  return (
    <main className="main main-narrow">
      <Steps current={3} />
      <div className="heading">
        <div>
          <h1>Make your offer</h1>
          <p className="subtle">Set a fee for each DJ. Gelatin adds its service fee and card processing and shows the total on the next step.</p>
        </div>
      </div>
      <OfferForm />
    </main>
  );
}
