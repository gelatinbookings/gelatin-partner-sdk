import { DEMO_TIME_ZONES } from "./time";

/** The demo caps one booking at five DJs so its cookie record stays small. */
export const MAX_DRAFT_DJS = 5;

export type DraftDj = { id: string; name: string; fee: string };

/** One booking being put together across the step pages, kept in this tab only. */
export type Draft = {
  nonce: string;
  /** The night picked in step 1. Availability was read for it, so it is the booking's date. */
  date: string;
  eventName: string;
  venueName: string;
  venueAddress: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  email: string;
  organizerName: string;
  note: string;
  selected: DraftDj[];
  /**
   * The organizer chose "Skip, no lineup right now": the event is created with
   * no talent, nothing goes to Gelatin and nothing is charged. A flag rather
   * than a step position, so it holds whatever order the steps come in.
   * Missing means false, so drafts saved before this existed still load.
   */
  noLineup?: boolean;
};

export function freshDraft(nonce: string): Draft {
  return {
    nonce, date: "", eventName: "", venueName: "", venueAddress: "", startTime: "21:00", endTime: "01:00",
    timeZone: "America/New_York", email: "", organizerName: "", note: "", selected: [], noLineup: false,
  };
}

/**
 * Step 1 read availability for `date`. A different night than the draft's means
 * the DJs picked before may not be free, so the picks are cleared.
 */
export function withAvailabilityDate(draft: Draft, date: string): { draft: Draft; cleared: boolean } {
  if (draft.date === date) return { draft, cleared: false };
  return { draft: { ...draft, date, selected: [] }, cleared: draft.selected.length > 0 };
}

export type PickableDj = { id: string; name: string; available: boolean | null; rateDollars: number | null };

/** Add or remove a DJ. Only a DJ Gelatin reports free on the draft's date can be added. */
export function toggleDj(draft: Draft, dj: PickableDj): { draft: Draft; error?: string } {
  if (draft.selected.some((item) => item.id === dj.id)) {
    return { draft: { ...draft, selected: draft.selected.filter((item) => item.id !== dj.id) } };
  }
  if (dj.available !== true) return { draft, error: `${dj.name} isn't available on this date.` };
  if (draft.selected.length >= MAX_DRAFT_DJS) return { draft, error: `The demo sends at most ${MAX_DRAFT_DJS} DJs per booking.` };
  return { draft: { ...draft, noLineup: false, selected: [...draft.selected, { id: dj.id, name: dj.name, fee: dj.rateDollars ? String(dj.rateDollars) : "" }] } };
}

/** "Skip, no lineup right now": drop any picks and create the event without talent. */
export function skipLineup(draft: Draft): Draft {
  return { ...draft, selected: [], noLineup: true };
}

/** Back from a no-lineup event to pick talent for it. The event details stay. */
export function addTalentLater(draft: Draft): Draft {
  return { ...draft, noLineup: false };
}

/** The picked DJs among `ids`, the ones Gelatin says were taken since they were added. */
export function takenDjs(draft: Draft, ids: readonly string[]): DraftDj[] {
  const taken = new Set(ids.map((id) => id.toLowerCase()));
  return draft.selected.filter((item) => taken.has(item.id.toLowerCase()));
}

/** Drop DJs from the booking, such as one taken while the organizer was browsing. */
export function removeDjs(draft: Draft, ids: readonly string[]): Draft {
  const gone = new Set(ids.map((id) => id.toLowerCase()));
  return { ...draft, selected: draft.selected.filter((item) => !gone.has(item.id.toLowerCase())) };
}

export function hasDjs(draft: Draft): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && draft.selected.length > 0;
}

/** The lineup question is answered: at least one DJ, or the organizer chose no lineup. */
/** Whether the picks need an availability re-check: never for an event created without a lineup. */
export function picksToCheck(draft: Draft): boolean {
  return draft.noLineup !== true && hasDjs(draft);
}

export function lineupChosen(draft: Draft): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && (draft.selected.length > 0 || draft.noLineup === true);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 2 is done when every required event field is filled in. */
export function eventComplete(draft: Draft): boolean {
  return Boolean(
    draft.eventName.trim() && draft.venueName.trim() && draft.venueAddress.trim() && draft.organizerName.trim()
    && EMAIL.test(draft.email.trim()) && /^\d{2}:\d{2}$/.test(draft.startTime) && /^\d{2}:\d{2}$/.test(draft.endTime)
    && (DEMO_TIME_ZONES as readonly string[]).includes(draft.timeZone),
  );
}

/** The event is ready to be created with no talent: nothing to send, nothing to charge. */
export function createdWithoutLineup(draft: Draft): boolean {
  return draft.noLineup === true && draft.selected.length === 0 && lineupChosen(draft) && eventComplete(draft);
}

/** The demo server's booking form body, or the first problem a person can fix. */
export function submissionBody(draft: Draft): { body: Record<string, unknown> } | { error: string } {
  if (!hasDjs(draft)) return { error: "Choose a date and at least one DJ." };
  if (!eventComplete(draft)) return { error: "Fill in the event details." };
  const fees = draft.selected.map((item) => Number(item.fee));
  if (fees.some((fee) => !Number.isInteger(fee) || fee < 50 || fee > 20_000)) {
    return { error: "Each DJ fee must be a whole number of dollars between $50 and $20,000." };
  }
  return {
    body: {
      nonce: draft.nonce, event_name: draft.eventName, venue_name: draft.venueName, venue_address: draft.venueAddress, date: draft.date,
      start_time: draft.startTime, end_time: draft.endTime, time_zone: draft.timeZone,
      organizer_email: draft.email.trim(), organizer_name: draft.organizerName,
      ...(draft.note.trim() ? { note: draft.note } : {}),
      djs: draft.selected.map((item, index) => ({ id: item.id, name: item.name, fee_dollars: fees[index] })),
    },
  };
}
