"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { addTalentLater, createdWithoutLineup, eventComplete, lineupChosen } from "../../lib/draft";
import { STEPS } from "../../lib/flow";
import { longDate } from "../steps";
import { replaceDraft, useDraft } from "../use-draft";

export default function CreatedSummary() {
  const router = useRouter();
  const { draft, clear } = useDraft();
  useEffect(() => {
    if (!draft || createdWithoutLineup(draft)) return;
    // Not a no-lineup event yet: go to whatever is missing.
    if (!lineupChosen(draft)) router.replace("/");
    else if (!eventComplete(draft)) router.replace("/event");
    else router.replace(STEPS.find((step) => step.talent)?.href ?? "/");
  }, [draft, router]);
  if (!draft || !createdWithoutLineup(draft)) return <p className="empty">Loading…</p>;

  return (
    <div className="stack">
      <div className="heading">
        <div>
          <p className="eyebrow">Event created</p>
          <h1>{draft.eventName}</h1>
          <p className="subtle">No lineup yet. Nothing was sent to a DJ and nothing was charged.</p>
        </div>
      </div>
      <section className="panel panel-body stack" aria-label="Event">
        <div className="summary-line">
          <span><strong>{draft.venueName}</strong> <span className="hint">{draft.venueAddress}</span></span>
          <span className="tag tag-no">No lineup</span>
        </div>
        <p className="hint">{longDate(draft.date)} · {draft.startTime}–{draft.endTime} ({draft.timeZone.replace("_", " ")}) · {draft.organizerName}, {draft.email}</p>
      </section>
      <p className="notice notice-info">
        A real partner saves the event on its own side here. Gelatin is not called until talent is picked, so you can add a lineup later from the same event.
      </p>
      <div className="step-actions">
        <button className="button-secondary" type="button" onClick={() => { clear(); router.push("/"); }}>
          Start a new event
        </button>
        <button
          className="button" type="button"
          onClick={() => {
            // Saved directly rather than through state, so this page's own
            // redirect doesn't race the navigation.
            replaceDraft(addTalentLater(draft));
            router.push(`/?date=${draft.date}`);
          }}
        >
          Add talent now
        </button>
      </div>
    </div>
  );
}
