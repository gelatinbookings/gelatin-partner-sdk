import Link from "next/link";
import type { DraftDj } from "../lib/draft";
import { longDate } from "./steps";

/**
 * A picked DJ was booked while the organizer was browsing. Name them, offer to
 * remove each one, and link back to step 1 to pick someone else that night.
 * With no names (Gelatin refused the send without saying who), it still says
 * what happened and how to fix it.
 */
export function TakenNotice({ date, djs, onRemove, pickLink = true }: {
  date: string;
  djs: DraftDj[];
  onRemove: (dj: DraftDj) => void;
  /** Off on step 1, where the other DJs for that night are already listed below. */
  pickLink?: boolean;
}) {
  const when = longDate(date);
  return (
    <section className="notice notice-warn taken" role="alert" aria-labelledby="taken-title">
      <p id="taken-title" className="taken-title">
        {djs.length === 0
          ? <>One of your DJs was booked for {when} while you were browsing.</>
          : djs.length === 1
            ? <>{djs[0].name} was booked for {when} while you were browsing.</>
            : <>{djs.length} of your DJs were booked for {when} while you were browsing.</>}
      </p>
      <p className="taken-copy">
        {djs.length === 0 ? "Check your picks and choose another DJ, then send it again." : "Remove them or pick someone else for that night. Your other details stay as they are."}
      </p>
      {djs.length > 0 && (
        <ul className="taken-list">
          {djs.map((dj) => (
            <li key={dj.id}>
              <span className="taken-name">{dj.name}</span>
              <button className="button-secondary button-small" type="button" onClick={() => onRemove(dj)} aria-label={`Remove ${dj.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {pickLink && <Link className="link-button" href={`/?date=${date}`}>Pick another DJ for {when}</Link>}
    </section>
  );
}
