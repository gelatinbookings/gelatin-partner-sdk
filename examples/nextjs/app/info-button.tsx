"use client";

import { useRef } from "react";

const CARDS = [
  { number: "4242 4242 4242 4242", result: "Hold succeeds" },
  { number: "4000 0027 6000 3184", result: "Asks for the bank's extra security check, then succeeds" },
  { number: "4000 0000 0000 0002", result: "Declined" },
  { number: "4000 0000 0000 9995", result: "Declined: insufficient funds" },
];

/** Test DJs on Gelatin's sandbox. Sign in as one to answer your booking. */
const DJ_LOGINS = [
  { name: "DJ Aurora", city: "Atlanta" }, { name: "Basslight", city: "Atlanta" },
  { name: "Copperline", city: "Atlanta" }, { name: "DJ Solstice", city: "Atlanta" },
  { name: "Meridian", city: "New York" }, { name: "Lumen", city: "New York" },
  { name: "Northbound", city: "Chicago" }, { name: "Palisade", city: "Los Angeles" },
].map((dj, index) => ({ ...dj, email: `partner.dj${index + 1}@gelatin.test` }));

export type DjAccess = {
  /** Gelatin's sign-in page for these DJs. */
  signInUrl: string;
  inboxUrl: string;
  /** The sandbox DJs' shared password, from DEMO_DJ_PASSWORD; null when it isn't set. */
  password: string | null;
};

/**
 * Header button with how to test the demo: test cards, what happens at each
 * step and, once signed in to the demo, the test DJ logins.
 */
export default function InfoButton({ djAccess = null }: { djAccess?: DjAccess | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="info-button" aria-label="Testing guide" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <span aria-hidden="true">i</span><span className="info-label">Testing guide</span>
      </button>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="info-title"
        onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}
      >
        <div className="modal-body">
          <div className="modal-head">
            <h2 id="info-title">How to test this demo</h2>
            <button type="button" className="link-button" onClick={() => dialog.current?.close()} aria-label="Close">Close</button>
          </div>
          <p className="subtle">This partner site uses Gelatin&apos;s sandbox and Stripe test mode. No real money moves, and only test cards work.</p>

          <h3 className="eyebrow">Test cards</h3>
          <table className="modal-table">
            <thead><tr><th scope="col">Card number</th><th scope="col">What happens</th></tr></thead>
            <tbody>
              {CARDS.map((card) => (
                <tr key={card.number}><td className="mono-cell">{card.number}</td><td>{card.result}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Use any future expiry date (for example 12 / 34), any 3-digit CVC, any name and any postal code.</p>

          <h3 className="eyebrow">The steps</h3>
          <ol className="modal-list">
            <li><strong>Date &amp; DJs:</strong> pick the night first; only DJs free that night can be added.</li>
            <li><strong>Event:</strong> &quot;Fill with sample details&quot; puts in a made-up event name and venue. Use an organizer email you can read: Gelatin sends the payment and booking emails there.</li>
            <li><strong>Offer:</strong> a fee per DJ from $50. Gelatin adds its $7 service fee and card processing.</li>
            <li><strong>Pay:</strong> &quot;Pay now&quot; opens Stripe&apos;s checkout on this page. The card is only held; it&apos;s charged when the DJ accepts.</li>
          </ol>

          {djAccess && (
            <>
              <h3 className="eyebrow">Play the DJ</h3>
              <p className="hint">
                Sign in to <a href={djAccess.signInUrl} target="_blank" rel="noreferrer noopener">Gelatin</a> as the DJ you booked, open the{" "}
                <a href={djAccess.inboxUrl} target="_blank" rel="noreferrer noopener">inbox</a>, then accept, counter or decline. Use a private window so you stay signed in here.
              </p>
              <table className="modal-table">
                <thead><tr><th scope="col">DJ</th><th scope="col">Email</th></tr></thead>
                <tbody>
                  {DJ_LOGINS.map((dj) => (
                    <tr key={dj.email}><td>{dj.name} <span className="hint">· {dj.city}</span></td><td className="mono-cell">{dj.email}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="hint">
                Password for all of them:{" "}
                {djAccess.password ? <span className="secret">{djAccess.password}</span> : "ask the Gelatin team (set it as DEMO_DJ_PASSWORD)."}
              </p>
            </>
          )}

          <h3 className="eyebrow">After you pay</h3>
          <ul className="modal-list">
            <li>The row changes to &quot;Card held&quot; within a few seconds, then to &quot;Confirmed&quot; when the DJ accepts. The page updates by itself.</li>
            <li>To move the booking on, play the DJ yourself (above) or ask the Gelatin team to accept, counter or decline.</li>
            <li>If the DJ comes back with a new price, the row offers &quot;Review the new offer in Gelatin&quot;. &quot;Manage in Gelatin&quot; opens the booking on Gelatin&apos;s page.</li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => dialog.current?.close()}>Got it</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
