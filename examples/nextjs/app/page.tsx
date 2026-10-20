import { z } from "zod";
import type { DjCatalogPage } from "@gelatinbookings/partner-sdk/types";
import { describeGelatinError, gelatinClient } from "../lib/gelatin";
import { requirePageSession } from "../lib/page-session";
import DjPicker, { type CatalogDj } from "./dj-picker";
import { Steps } from "./steps";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  city: z.string().trim().max(80).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(1000).optional().catch(undefined),
});

const TIERS: Record<string, string> = {
  verified: "Verified", top_performer: "Top performer", resident: "Resident", city_pillar: "City pillar",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DJ";
}

/** Step 1: the night first, then who is free that night. */
export default async function DatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { config } = await requirePageSession();
  const raw = await searchParams;
  const query = querySchema.parse({ city: raw.city, date: raw.date, cursor: raw.cursor });

  let page: DjCatalogPage | null = null;
  let failure: ReturnType<typeof describeGelatinError> | null = null;
  if (query.date) {
    // Gelatin call 1 of 5: `listDjs`. With a `date`, each DJ's `available` is
    // for that night. It's advisory: Gelatin checks again when the request is
    // sent, and answers `409 dj_unavailable` if the DJ was booked meanwhile.
    try {
      page = await gelatinClient(config).listDjs({ city: query.city || undefined, date: query.date, cursor: query.cursor, limit: 25 });
    } catch (error) {
      failure = describeGelatinError(error);
    }
  }

  const djs: CatalogDj[] = (page?.items ?? []).map((dj) => ({
    id: dj.id,
    name: dj.name,
    city: dj.city,
    tier: TIERS[dj.tier] ?? "Verified",
    initials: initials(dj.name),
    // Show only https images and links from Gelatin.
    imageUrl: dj.image_url && dj.image_url.startsWith("https://") ? dj.image_url : null,
    available: dj.available,
    // A null rate means show no price at all, not $0.
    rateDollars: dj.published_rate_cents === null ? null : Math.round(dj.published_rate_cents / 100),
    profileUrl: dj.profile_url.startsWith("https://") ? dj.profile_url : null,
  }));
  const next = new URLSearchParams();
  if (query.city) next.set("city", query.city);
  if (query.date) next.set("date", query.date);
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
        suggestedDate={new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)}
        city={query.city ?? ""}
        djs={djs}
        nextHref={page?.next_cursor ? `/?${next}` : null}
        failure={failure ? { message: failure.message, requestId: failure.requestId } : null}
      />
    </main>
  );
}
