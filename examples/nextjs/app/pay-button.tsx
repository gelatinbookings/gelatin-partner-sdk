"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";

type Session = { clientSecret: string; publishableKey: string };

/**
 * Gelatin call 3 of 5, in the browser: show Stripe's checkout on this page.
 *
 * 1. "Pay now" asks this site's server (/api/payment), which calls
 *    `createPaymentSession`. The API key stays on the server; the browser only
 *    gets `client_secret` and `publishable_key`.
 * 2. Stripe.js mounts the checkout with them. Card details go to Stripe only.
 * 3. When Stripe finishes, the hold isn't trusted yet: show "Confirming" and
 *    re-read status until Gelatin reports `requested` (Stripe tells Gelatin
 *    by webhook, which takes a few seconds).
 *
 * Pays for one DJ right here: the demo server asks Gelatin for a payment
 * session, and Stripe's embedded checkout opens under the row. Card details go
 * to Stripe only. A DJ's counteroffer, or a hold started in Gelatin, falls back
 * to the Gelatin booking page.
 */
export default function PayButton({ eventId, requestId, djName }: { eventId: string; requestId: string; djName: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "paying" | "confirming" | "error">("idle");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  async function post(path: string) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, request_id: requestId }),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, body };
  }

  async function start() {
    setState("starting");
    try {
      const { response, body } = await post("/api/payment");
      if (response.status === 401) { router.push("/login"); return; }
      // `409 portal_required`: a DJ's counteroffer is paid in Gelatin, not here.
      if (response.status === 409 && body.portal === true) {
        // This offer is finished in Gelatin: hand over with a one-use link instead.
        const launch = await post("/api/launch");
        if (launch.response.ok && typeof launch.body.url === "string") { window.location.assign(launch.body.url); return; }
        throw new Error(typeof launch.body.error === "string" ? launch.body.error : "Could not open Gelatin.");
      }
      if (!response.ok || typeof body.client_secret !== "string" || typeof body.publishable_key !== "string") {
        throw new Error(`${typeof body.error === "string" ? body.error : "Could not start the payment."}${typeof body.request_id === "string" ? ` Request ${body.request_id}.` : ""}`);
      }
      setSession({ clientSecret: body.client_secret, publishableKey: body.publishable_key });
      setState("paying");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not reach the demo server. Try again.");
    }
  }

  // Stripe confirms the hold to Gelatin by webhook; re-read the status a few times.
  useEffect(() => {
    if (state !== "confirming") return;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= 40) window.clearInterval(timer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [state, router]);

  if (state === "paying" && session) {
    return (
      <div className="pay-panel">
        <div className="pay-frame">
          <span className="pay-frame-tag">Secure checkout · served by Gelatin</span>
          <EmbeddedCheckout session={session} onComplete={() => setState("confirming")} />
        </div>
        <button className="link-button" type="button" onClick={() => { setSession(null); setState("idle"); }}>Cancel</button>
      </div>
    );
  }
  if (state === "confirming") return <span className="tag" role="status">Confirming card hold…</span>;
  return (
    <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <button className="button" type="button" onClick={start} disabled={state === "starting"} aria-label={`Pay for ${djName}`}>
        {state === "starting" ? "Starting…" : "Pay now"}
      </button>
      {state === "error" && <span className="hint" role="alert" style={{ color: "var(--danger)" }}>{message}</span>}
    </span>
  );
}

let teardown: Promise<void> = Promise.resolve();

function EmbeddedCheckout({ session, onComplete }: { session: Session; onComplete: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const done = useRef(onComplete);
  const [failed, setFailed] = useState(false);
  useEffect(() => { done.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    // Stripe allows one embedded checkout per page, so wait for the last one to be destroyed.
    const run = teardown.then(async () => {
      if (cancelled) return null;
      try {
        const stripe = await loadStripe(session.publishableKey);
        if (!stripe) throw new Error("Stripe.js did not load");
        const created = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret: async () => session.clientSecret,
          onComplete: () => done.current(),
        });
        if (cancelled || !mount.current) { created.destroy(); return null; }
        created.mount(mount.current);
        return created;
      } catch (error) {
        console.error("Stripe embedded checkout failed to mount", error);
        if (!cancelled) setFailed(true);
        return null;
      }
    });
    return () => {
      cancelled = true;
      teardown = run.then((created) => created?.destroy()).catch(() => undefined);
    };
  }, [session.clientSecret, session.publishableKey]);

  return (
    <>
      {failed && <p className="notice notice-error" role="alert">Stripe&apos;s checkout didn&apos;t load. Check your connection and try again.</p>}
      <div ref={mount} />
    </>
  );
}
