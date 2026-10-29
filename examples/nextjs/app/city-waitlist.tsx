"use client";

import { useId, useState, type FormEvent } from "react";
import type { DirectoryCity } from "@gelatinbookings/partner-sdk/types";

type State =
  | { kind: "idle" | "sending" }
  | { kind: "done"; status: "subscribed" | "already_subscribed"; email: string }
  | { kind: "error"; message: string; requestId: string | null };

/**
 * The empty state for a city Gelatin isn't in yet: say so, and offer to tell
 * the organizer when DJs are available there. Clicking "Notify me" is the ask;
 * the server sends it to Gelatin's `joinCityWaitlist` with `consent: true`.
 */
export default function CityWaitlist({ city }: { city: DirectoryCity }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/city-waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, city: city.label }),
      });
      const body = await response.json().catch(() => ({})) as { status?: string; error?: string; request_id?: string | null };
      if (response.ok && (body.status === "subscribed" || body.status === "already_subscribed")) {
        setState({ kind: "done", status: body.status, email: email.trim().toLowerCase() });
      } else {
        setState({ kind: "error", message: body.error ?? "Gelatin is unavailable right now. Try again shortly.", requestId: body.request_id ?? null });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and try again.", requestId: null });
    }
  }

  return (
    <div className="waitlist" aria-labelledby={`${id}-title`} role="group">
      <h3 id={`${id}-title`}>Gelatin isn&rsquo;t in {city.name} yet</h3>
      <p className="hint">No DJs are in {city.label} or travel there yet. Leave an email and Gelatin will tell you when DJs are available.</p>

      {state.kind === "done" ? (
        <p className={state.status === "subscribed" ? "notice notice-ok" : "notice notice-info"} role="status">
          {state.status === "subscribed"
            ? <>You&rsquo;re on the list. Gelatin will email <strong>{state.email}</strong> when DJs are available in {city.name}.</>
            : <><strong>{state.email}</strong> is already on the list for {city.name}. Gelatin will email you when DJs are available.</>}
        </p>
      ) : (
        <form className="waitlist-form" onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email" name="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(event) => setEmail(event.target.value)}
              aria-invalid={state.kind === "error" || undefined} aria-describedby={state.kind === "error" ? `${id}-error` : `${id}-fine`}
            />
          </label>
          <button className="button" type="submit" disabled={state.kind === "sending"}>
            {state.kind === "sending" ? "Saving…" : "Notify me"}
          </button>
        </form>
      )}

      {state.kind === "error" && (
        <p id={`${id}-error`} className="notice notice-error" role="alert">
          {state.message}{state.requestId && <> <span className="mono">Request {state.requestId}</span></>}
        </p>
      )}
      {state.kind !== "done" && (
        <p id={`${id}-fine`} className="waitlist-fine">Only about DJs in {city.label}. Meanwhile, try a nearby city or Any city.</p>
      )}
    </div>
  );
}
