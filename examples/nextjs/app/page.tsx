import { z } from "zod";
import type { DjCatalogPage } from "@gelatinbookings/partner-sdk/types";
import { describeGelatinError, gelatinClient } from "../lib/gelatin";
import { requirePageSession } from "../lib/page-session";
import BookingBuilder, { type CatalogDj } from "./booking-builder";

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

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { config } = await requirePageSession();
  const raw = await searchParams;
  const query = querySchema.parse({ city: raw.city, date: raw.date, cursor: raw.cursor });

  let page: DjCatalogPage | null = null;
  let failure: ReturnType<typeof describeGelatinError> | null = null;
  try {
    page = await gelatinClient(config).listDjs({ city: query.city || undefined, date: query.date, cursor: query.cursor, limit: 25 });
  } catch (error) {
    failure = describeGelatinError(error);
  }

  const djs: CatalogDj[] = (page?.items ?? []).map((dj) => ({
    id: dj.id,
    name: dj.name,
    city: dj.city,
    tier: TIERS[dj.tier] ?? "Verified",
    initials: initials(dj.name),
    available: query.date ? dj.available : null,
    rateDollars: dj.published_rate_cents === null ? null : Math.round(dj.published_rate_cents / 100),
    profileUrl: dj.profile_url.startsWith("https://") ? dj.profile_url : null,
  }));
  const next = new URLSearchParams();
  if (query.city) next.set("city", query.city);
  if (query.date) next.set("date", query.date);
  if (page?.next_cursor) next.set("cursor", page.next_cursor);

  return (
    <main className="main">
      <div className="heading">
        <div>
          <p className="eyebrow">Step 1 of 3</p>
          <h1>Book DJs for your event</h1>
          <p className="subtle">DJs come from Gelatin&apos;s partner catalog. Gelatin handles the offer, payment and DJ replies.</p>
        </div>
      </div>
      <BookingBuilder
        djs={djs}
        filters={{ city: query.city ?? "", date: query.date ?? "" }}
        nextHref={page?.next_cursor ? `/?${next}` : null}
        failure={failure ? { message: failure.message, requestId: failure.requestId } : null}
      />
    </main>
  );
}
