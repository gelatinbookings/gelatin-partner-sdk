"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Asks the demo server for a one-use Gelatin link and goes there immediately. */
export default function LaunchButton({ eventId, requestId, djName, label = "Review and pay in Gelatin", secondary = false }: { eventId: string; requestId: string; djName: string; label?: string; secondary?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [message, setMessage] = useState("");

  async function launch() {
    setState("sending");
    try {
      const response = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, request_id: requestId }),
      });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string; request_id?: string | null };
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok || !body.url) {
        setState("error");
        setMessage(`${body.error ?? "Could not open Gelatin."}${body.request_id ? ` Request ${body.request_id}.` : ""}`);
        return;
      }
      // The server only returns Gelatin's /partner/launch URL on an approved portal origin.
      window.location.assign(body.url);
    } catch {
      setState("error");
      setMessage("Could not reach the demo server. Try again.");
    }
  }

  return (
    <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <button className={secondary ? "button-secondary" : "button"} type="button" onClick={launch} disabled={state === "sending"} aria-label={`Open ${djName} in Gelatin`}>
        {state === "sending" ? "Opening…" : label}
      </button>
      {state === "error" && <span className="hint" role="alert" style={{ color: "var(--danger)" }}>{message}</span>}
    </span>
  );
}
