import { z } from "zod";
import { findGenre } from "@gelatinbookings/partner-sdk/genres";
import type { CityDirectory, DjCatalogPage, GenreDirectory } from "@gelatinbookings/partner-sdk/types";
import { budgetFromSearch, toCatalogDj } from "../lib/catalog-view";
import { describeGelatinError, gelatinClient } from "../lib/gelatin";
import { requirePageSession } from "../lib/page-session";
import DjPicker from "./dj-picker";
import { Steps } from "./steps";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  city: z.string().trim().max(100).optional().catch(undefined),
  genre: z.string().trim().max(60).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(1000).optional().catch(undefined),
});

/** Two weeks out, worked out once per request so server and browser agree. */
function suggestedDate(): string {
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}

/** Step 1: the night first, then who is free that night. */
export default async function DatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { config, tier } = await requirePageSession();
  const light = tier === "light";
  const raw = await searchParams;
  const query = querySchema.parse({ city: raw.city, genre: raw.genre, date: raw.date, cursor: raw.cursor });
  // Light is a typed city and a DJ: no directory, genre or budget.
  const budget = light ? [] : budgetFromSearch(raw.budget);

  const gelatin = gelatinClient(config);
  const city = query.city || undefined;
  const [cities, genres] = light ? [null, null] : await Promise.all([
    // Gelatin call 1 of 5, part 1: `listCities`. Every US state with its major
    // cities and this partner's DJ count in each. Without it the City field is
    // plain typing, so a failure here never blocks the page.
    gelatin.listCities().catch((): CityDirectory | null => null),
    // Gelatin call 1 of 5, part 3: `listGenres`. Only genres DJs in this city
    // list, with counts. Without it the Genre field is plain typing.
    gelatin.listGenres({ city }).catch((): GenreDirectory | null => null),
  ]);
  // A genre picked for another city that this city's DJs don't list would
  // find nobody, so it is dropped (and the organizer told) rather than sent.
  const listed = query.genre && genres ? findGenre(genres, query.genre) : null;
  const genre = light ? undefined : genres ? listed?.name : query.genre || undefined;
  const droppedGenre = !light && query.genre && genres && !listed ? query.genre : null;

  const { page, failure } = await (
    // Gelatin call 1 of 5, part 2: `listDjs`. With a `date`, each DJ's
    // `available` is for that night. It's advisory: Gelatin checks again when
    // the request is sent, and answers `409 dj_unavailable` if the DJ was
    // booked meanwhile. `city` takes a label from `listCities`, `genre` a
    // name from `listGenres`. `budget` keeps DJs whose real minimum rate is in
    // a ticked band, private rates included.
    query.date
      ? gelatin.listDjs({ city, genre, date: query.date, budget, cursor: droppedGenre ? undefined : query.cursor, limit: 25 })
        .then((result: DjCatalogPage) => ({ page: result, failure: null }), (error: unknown) => ({ page: null, failure: describeGelatinError(error) }))
      : Promise.resolve({ page: null, failure: null })
  );

  const djs = (page?.items ?? []).map(toCatalogDj);
  const cityChosen = raw.city !== undefined;
  const next = new URLSearchParams();
  if (cityChosen) next.set("city", query.city ?? "");
  if (genre) next.set("genre", genre);
  if (query.date) next.set("date", query.date);
  for (const band of budget) next.append("budget", band);
  if (page?.next_cursor) next.set("cursor", page.next_cursor);

  return (
    <main className="main main-narrow">
      <Steps current={1} />
      <div className="heading">
        <div>
          <h1>When is your event?</h1>
          <p className="subtle">Pick the night first. Gelatin shows which DJs are free then, and that night becomes the booking date.</p>
        </div>
      </div>
      <DjPicker
        date={query.date ?? null}
        suggestedDate={suggestedDate()}
        city={query.city ?? ""}
        cityChosen={cityChosen}
        budget={budget}
        cities={cities}
        genre={genre ?? ""}
        genres={genres?.genres ?? null}
        droppedGenre={droppedGenre}
        djs={djs}
        nextHref={page?.next_cursor ? `/?${next}` : null}
        failure={failure ? { message: failure.message, requestId: failure.requestId } : null}
        light={light}
      />
    </main>
  );
}
