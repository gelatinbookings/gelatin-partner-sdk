import type { GelatinClient } from "./gelatin";

/** 100 DJs a page, at most five pages: one check never costs more than five catalog reads. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type PickedAvailability = {
  /** Picked DJs Gelatin no longer reports free that night, or no longer lists at all. */
  unavailable: string[];
  /** False when the page limit ran out first; DJs not yet seen are never flagged. */
  complete: boolean;
};

/**
 * Re-read `listDjs` for the booking's night and say which picked DJs were
 * taken since they were added. Availability is advisory, so this only warns
 * early: Gelatin still checks again when the request is sent.
 *
 * The catalog has no ID filter, so it pages through every city and stops as
 * soon as each picked DJ has been seen.
 */
export async function checkPickedAvailability(
  client: Pick<GelatinClient, "listDjs">,
  date: string,
  ids: readonly string[],
  { maxPages = MAX_PAGES }: { maxPages?: number } = {},
): Promise<PickedAvailability> {
  const wanted = new Map(ids.map((id) => [id.toLowerCase(), id]));
  const free = new Map<string, boolean>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.listDjs({ date, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
    for (const dj of result.items) {
      const key = dj.id.toLowerCase();
      if (wanted.has(key)) free.set(key, dj.available === true);
    }
    if (free.size === wanted.size || !result.next_cursor) {
      // Every page read: a DJ never seen is no longer listed for this partner.
      const unavailable = [...wanted].filter(([key]) => free.get(key) !== true).map(([, id]) => id);
      return { unavailable, complete: true };
    }
    cursor = result.next_cursor;
  }
  return { unavailable: [...wanted].filter(([key]) => free.get(key) === false).map(([, id]) => id), complete: false };
}

/**
 * Which DJ a `409 dj_unavailable` names. The demo numbers its requests
 * `demo-req-<nonce>-<n>` in the order the DJs were sent (see submission.ts).
 */
export function djIdForUnavailableRequest(externalRequestId: string | null, nonce: string, djs: readonly { id: string }[]): string | null {
  const prefix = `demo-req-${nonce}-`;
  if (!externalRequestId?.startsWith(prefix)) return null;
  const position = Number(externalRequestId.slice(prefix.length));
  return Number.isInteger(position) && position >= 1 && position <= djs.length ? djs[position - 1].id : null;
}
