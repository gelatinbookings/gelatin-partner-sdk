import Link from "next/link";
import { STEPS } from "../lib/flow";

export { STEPS };

/** Where the organizer is in the booking. Earlier steps link back; later ones don't. */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav className="steps" aria-label="Booking steps">
      <ol>
        {STEPS.map((step, index) => {
          const number = index + 1;
          const state = number < current ? "done" : number === current ? "current" : "next";
          return (
            <li key={step.href} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="step-number" aria-hidden="true">{number}</span>
              {state === "done" && current < 4 ? <Link href={step.href}>{step.label}</Link> : <span>{step.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function longDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}
