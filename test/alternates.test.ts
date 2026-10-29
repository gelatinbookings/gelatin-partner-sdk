import { describe, expect, it, vi } from "vitest";
import { createPartnerClient } from "../src/server.js";

const body = {
  request_id: "req_1", dj_id: "dj_passed", date: "2032-03-11", city: "Billings, MT",
  budget: { currency: "usd", dj_fee_cents: 40000 },
  event: { name: "Night", venue_name: "Room", venue_address: "1 Synthetic Ave, Billings, MT 59101", starts_at: "2032-03-12T03:00:00Z", ends_at: "2032-03-12T07:00:00Z", time_zone: "America/Denver" },
  items: [{ id: "dj_2", name: "Alt", city: "Billings, MT", tier: "verified", profile_url: "https://gelatin.example/djs/alt", image_url: null, draw: null, published_rate_cents: 45000, available: true, private_rate: 1 }],
};
const client = (response: Response) => {
  const fetcher = vi.fn(async () => response) as unknown as typeof fetch;
  return { fetcher, gelatin: createPartnerClient({ baseUrl: "https://api.gelatin.example/v1/partners/acme", apiKey: "gel_test_private", fetch: fetcher }) };
};

describe("listAlternates", () => {
  it("reads the lost request's alternates and keeps only public fields", async () => {
    const { fetcher, gelatin } = client(Response.json(body));
    const result = await gelatin.listAlternates("event 7", "req_1");
    const [url] = vi.mocked(fetcher).mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.gelatin.example/v1/partners/acme/events/event%207/dj-bookings/req_1/alternates");
    expect(result.items[0]).not.toHaveProperty("private_rate");
    expect(result).toMatchObject({ date: "2032-03-11", city: "Billings, MT", budget: { dj_fee_cents: 40000 }, event: { time_zone: "America/Denver" } });
  });

  it.each([
    { ...body, date: "11/03/2032" },
    { ...body, budget: { currency: "usd", dj_fee_cents: -1 } },
    { ...body, items: [{ ...body.items[0], available: "yes" }] },
    { ...body, event: { ...body.event, name: "" } },
  ])("rejects a malformed body %#", async (malformed) => {
    await expect(client(Response.json(malformed)).gelatin.listAlternates("event", "req_1")).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("surfaces a live request as request_active", async () => {
    const live = Response.json({ error: { code: "request_active", message: "open", request_id: "trace" } }, { status: 409 });
    await expect(client(live).gelatin.listAlternates("event", "req_1")).rejects.toMatchObject({ status: 409, code: "request_active" });
  });
});
