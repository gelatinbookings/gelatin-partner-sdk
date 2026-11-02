import type { BudgetBand } from "@gelatinbookings/partner-sdk/budget";
import type { DjCatalogPage } from "@gelatinbookings/partner-sdk/types";
import type { GelatinClient } from "./gelatin";

const PAGE_SIZE = 25;

export type FreeDjs = {
  /** Only DJs Gelatin says are free on the night. */
  page: DjCatalogPage;
  /** The first page is empty, yet DJs match the filters: all of them are booked, held or off that night. */
  allBooked: boolean;
};

/**
 * Step 1's list once a night is picked: only the DJs free then, so
 * the organizer never scrolls past someone they can't book. `available` is
 * advisory; Gelatin checks again when the request is sent.
 *
 * An empty first page asks once more, without the night, whether any DJ
 * matches at all. That tells "No DJs free that night" (change the date) from
 * filters nobody matches (change the filters).
 */
export async function listFreeDjs(
  client: Pick<GelatinClient, "listDjs">,
  query: { city?: string; genre?: string; budget: readonly BudgetBand[]; date: string; cursor?: string },
): Promise<FreeDjs> {
  const { date, cursor, ...filters } = query;
  const result = await client.listDjs({ ...filters, date, available: true, ...(cursor ? { cursor } : {}), limit: PAGE_SIZE });
  // An API that predates `available` would list everyone; never show a DJ it says is taken.
  const page = { ...result, items: result.items.filter((dj) => dj.available === true) };
  if (page.items.length > 0 || cursor) return { page, allBooked: false };
  const anyone = await client.listDjs({ ...filters, limit: 1 }).then((matches) => matches.items.length > 0, () => false);
  return { page, allBooked: anyone };
}
