import { describe, expect, it, vi } from "vitest";
import type { DjCatalogPage, DjCatalogQuery, PublicDj } from "@gelatinbookings/partner-sdk/types";
import { checkPickedAvailability, djIdForUnavailableRequest } from "./availability";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function dj(id: string, available: boolean | null): PublicDj {
  return {
    id, name: `DJ ${id.slice(0, 1)}`, city: "Atlanta, GA", tier: "verified", image_url: null, available,
    published_rate_cents: null, draw: null, profile_url: "https://gelatin.example/djs/x",
  } as PublicDj;
}

function pages(...items: PublicDj[][]) {
  return vi.fn(async (query: DjCatalogQuery = {}): Promise<DjCatalogPage> => {
    const index = query.cursor ? Number(query.cursor) : 0;
    return { items: items[index] ?? [], next_cursor: index + 1 < items.length ? String(index + 1) : null } as DjCatalogPage;
  });
}

describe("re-checking the picked DJs for the booking's night", () => {
  it("reports nothing when every picked DJ is still free", async () => {
    const listDjs = pages([dj(A, true), dj(B, true)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A, B])).toEqual({ unavailable: [], complete: true });
    expect(listDjs).toHaveBeenCalledWith({ date: "2031-11-13", limit: 100 });
  });

  it("flags a DJ who was booked while the organizer was browsing", async () => {
    const listDjs = pages([dj(A, true), dj(B, false)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A, B])).toEqual({ unavailable: [B], complete: true });
  });

  it("treats an unknown answer as unavailable, because only a DJ reported free can be booked", async () => {
    const listDjs = pages([dj(A, null)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A])).toEqual({ unavailable: [A], complete: true });
  });

  it("follows pages until it has seen every picked DJ, then stops", async () => {
    const listDjs = pages([dj(C, true)], [dj(A, false)], [dj(B, true)], [dj("44444444-4444-4444-8444-444444444444", true)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A, B])).toEqual({ unavailable: [A], complete: true });
    expect(listDjs).toHaveBeenCalledTimes(3);
  });

  it("flags a DJ the whole catalog no longer lists for this partner", async () => {
    const listDjs = pages([dj(A, true)], [dj(C, true)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A, B])).toEqual({ unavailable: [B], complete: true });
  });

  it("never flags a DJ it ran out of pages before finding", async () => {
    const listDjs = pages([dj(C, true)], [dj(C, true)], [dj(B, false)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A, B], { maxPages: 2 })).toEqual({ unavailable: [], complete: false });
    expect(listDjs).toHaveBeenCalledTimes(2);
  });

  it("matches IDs without regard to case", async () => {
    const listDjs = pages([dj(A.toUpperCase(), false)]);
    expect(await checkPickedAvailability({ listDjs }, "2031-11-13", [A])).toEqual({ unavailable: [A], complete: true });
  });
});

describe("which DJ a 409 dj_unavailable names", () => {
  const djs = [{ id: A }, { id: B }];
  it("maps the request's external ID back to the DJ in that position", () => {
    expect(djIdForUnavailableRequest("demo-req-n1-2", "n1", djs)).toBe(B);
    expect(djIdForUnavailableRequest("demo-req-n1-1", "n1", djs)).toBe(A);
  });

  it("ignores an ID from another booking, out of range, or missing", () => {
    expect(djIdForUnavailableRequest("demo-req-n2-1", "n1", djs)).toBeNull();
    expect(djIdForUnavailableRequest("demo-req-n1-3", "n1", djs)).toBeNull();
    expect(djIdForUnavailableRequest("demo-req-n1-0", "n1", djs)).toBeNull();
    expect(djIdForUnavailableRequest(null, "n1", djs)).toBeNull();
  });
});
