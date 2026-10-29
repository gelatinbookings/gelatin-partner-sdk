import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BUDGET_BANDS } from "../src/budget.js";
import { createPartnerClient } from "../src/server.js";
import type { DjRequestSubmission } from "../src/types.js";

const specPath = fileURLToPath(new URL("../openapi/partner-api.openapi.json", import.meta.url));
const spec = JSON.parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;

describe("public partner contract", () => {
  it("exposes the complete pilot endpoint set with scoped bearer auth and idempotent writes", () => {
    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(Object.keys(paths).sort()).toEqual([
      "/v1/partners/{partner}/djs",
      "/v1/partners/{partner}/cities",
      "/v1/partners/{partner}/city-waitlist",
      "/v1/partners/{partner}/genres",
      "/v1/partners/{partner}/booking-requests",
      "/v1/partners/{partner}/dj-request-submissions",
      "/v1/partners/{partner}/events/{external_event_id}",
      "/v1/partners/{partner}/events/{external_event_id}/attendance",
      "/v1/partners/{partner}/events/{external_event_id}/dj-bookings",
      "/v1/partners/{partner}/events/{external_event_id}/dj-bookings/{request_id}/alternates",
      "/v1/partners/{partner}/events/{external_event_id}/lineup",
      "/v1/partners/{partner}/launch-sessions",
      "/v1/partners/{partner}/payment-sessions",
      "/v1/partners/{partner}/portal-launches",
    ].sort());
    const ids = new Set<string>();
    for (const path of Object.values(paths)) {
      for (const [method, operation] of Object.entries(path)) {
        expect(operation.security).toEqual([{ PartnerBearer: [] }]);
        expect(ids.has(operation.operationId as string)).toBe(false);
        ids.add(operation.operationId as string);
        const parameters = operation.parameters as Array<{ name: string; required: boolean }>;
        expect(parameters).toContainEqual(expect.objectContaining({ name: "partner", required: true }));
        if (method !== "get") {
          expect(parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: true }));
        }
      }
    }
    expect(ids.size).toBe(14);
  });

  it("has no unresolved component references or bundled runtime dependencies", () => {
    const refs: string[] = [];
    function visit(value: unknown): void {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "$ref") refs.push(child as string);
        else visit(child);
      }
    }
    visit(spec);
    for (const ref of refs) {
      expect(ref).toMatch(/^#\/components\/(schemas|responses)\//);
      const segments = ref.slice(2).split("/");
      let value: unknown = spec;
      for (const segment of segments) value = (value as Record<string, unknown>)?.[segment];
      expect(value, `missing ${ref}`).toBeDefined();
    }
    const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));
    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    expect(manifest.dependencies).toEqual({});
  });

  it("models one partner booking with multiple independently payable DJ engagements", () => {
    const schemas = (spec.components as { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> }).schemas;
    expect(schemas.DjRequestSubmission.required).toContain("external_booking_id");
    expect(schemas.SubmissionResult.required).toContain("partner_booking_id");
    expect(schemas.EventBookings.required).toContain("bookings");
    expect(schemas.EventBookings.properties?.bookings).toBeDefined();
    expect(schemas.PartnerBookingProjection.required).toEqual(expect.arrayContaining(["partner_booking_id", "external_booking_id", "requests"]));
  });

  it("requires the complete event interval and timezone in the public request contract", () => {
    const schemas = (spec.components as { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> }).schemas;
    expect(schemas.EventContext.required).toEqual(expect.arrayContaining(["starts_at", "ends_at", "time_zone"]));
    expect(schemas.EventContext.properties?.ends_at).toMatchObject({ type: "string", format: "date-time" });
    expect(schemas.EventContext.properties?.time_zone).toMatchObject({ type: "string" });
  });

  it("uses both placement examples that the optional wrapper can send and understand", async () => {
    const paths = spec.paths as Record<string, Record<string, unknown>>;
    const operation = paths["/v1/partners/{partner}/dj-request-submissions"].post as {
      requestBody: { content: { "application/json": { examples: Record<string, { value: DjRequestSubmission }> } } };
      responses: { "201": { content: { "application/json": { examples: Record<string, { value: unknown }> } } } };
    };
    for (const [name, kind] of [["portal", "portal"], ["inFlow", "in_flow"]] as const) {
      const exampleRequest = operation.requestBody.content["application/json"].examples[name].value;
      expect(Date.parse(exampleRequest.event.ends_at)).toBeGreaterThan(Date.parse(exampleRequest.event.starts_at));
      expect(exampleRequest.event.time_zone).toBe("America/New_York");
      const exampleResponse = operation.responses["201"].content["application/json"].examples[name].value;
      const fetcher = vi.fn(async () => Response.json(exampleResponse));
      const client = createPartnerClient({ baseUrl: "https://api.example.test/v1/partners/acme", apiKey: "gel_test_example", fetch: fetcher });

      const result = await client.submitDjRequests(exampleRequest, { idempotencyKey: "stable-intent-1" });

      expect(result.partner_booking_id).toBeTruthy();
      expect(result.requests[0]?.authorization.kind).toBe(kind);
      if (name === "portal") {
        expect(exampleRequest.requests).toHaveLength(2);
        expect(result.requests).toHaveLength(2);
        expect(new Set(result.requests.map((item) => item.dj_id)).size).toBe(2);
      }
      expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(exampleRequest);
    }
  });

  it("describes the mounted submission and portal launch routes the wrapper calls", () => {
    const paths = spec.paths as Record<string, Record<string, { operationId: string; requestBody: { content: Record<string, { schema: { $ref: string } }> }; responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }> }>>;
    const submit = paths["/v1/partners/{partner}/booking-requests"].post;
    expect(submit.operationId).toBe("submitBookingRequests");
    expect(submit.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/DjRequestSubmission");
    expect(submit.responses["201"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/BookingRequestResult");
    // Both placements are accepted now, so submission has no 422.
    expect(submit.responses["422"]).toBeUndefined();
    const launch = paths["/v1/partners/{partner}/portal-launches"].post;
    expect(launch.operationId).toBe("createPortalLaunch");
    expect(launch.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/LaunchSessionRequest");
    expect(launch.responses["201"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/LaunchSessionResult");
    const payment = paths["/v1/partners/{partner}/payment-sessions"].post;
    expect(payment.operationId).toBe("createPaymentSession");
    expect(payment.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/PaymentSessionRequest");
    expect(payment.responses["201"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/PaymentSessionResult");
    const schemas = (spec.components as { schemas: Record<string, { required?: string[] }> }).schemas;
    expect(schemas.PaymentSessionResult.required).toEqual(["client_secret", "publishable_key", "total_cents", "currency"]);
    expect(schemas.BookingRequestResult.required).toEqual(["group_id", "event_id", "engagements"]);
    expect(schemas.BookingRequestEngagement.required).toEqual(expect.arrayContaining(["request_id", "booking_id", "total_cents", "currency"]));
  });

  it("describes the public lineup as display data with no money or booking identifiers", () => {
    const paths = spec.paths as Record<string, Record<string, { operationId: string; parameters: Array<{ name: string; in: string; schema?: { enum?: string[] } }>; responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }> }>>;
    const lineup = paths["/v1/partners/{partner}/events/{external_event_id}/lineup"].get;
    expect(lineup.operationId).toBe("getEventLineup");
    expect(lineup.parameters).toContainEqual(expect.objectContaining({ name: "include", in: "query", schema: expect.objectContaining({ enum: ["pending"] }) }));
    expect(lineup.responses["200"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/EventLineup");
    expect(Object.keys(lineup.responses)).toEqual(expect.arrayContaining(["304", "400", "401", "403", "404", "429", "503"]));
    const schemas = (spec.components as { schemas: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }>; additionalProperties?: boolean }> }).schemas;
    expect(schemas.EventLineup.required).toEqual(["external_event_id", "entries"]);
    expect(Object.keys(schemas.LineupEntry.properties ?? {}).sort()).toEqual(["dj_id", "image_url", "name", "profile_url", "status"]);
    expect(schemas.LineupEntry.properties?.status.enum).toEqual(["confirmed", "pending"]);
  });

  it("documents the permanent submission errors on the mounted route", () => {
    const submit = (spec.paths as Record<string, Record<string, { responses: Record<string, { description: string }> }>>)["/v1/partners/{partner}/booking-requests"].post;
    expect(submit.responses["409"].description).toContain("`dj_unavailable`");
    expect(submit.responses["409"].description).toContain("`conflict`");
    expect(submit.responses["400"].description).toContain("100,000,000");
    expect(submit.responses["503"].description).toContain("Retry-After: 30");
  });

  it("documents exactly the SDK's budget bands on the catalog read", () => {
    const list = (spec.paths as Record<string, Record<string, { parameters: Array<{ name: string; schema: { pattern: string } }> }>>)["/v1/partners/{partner}/djs"].get;
    const budget = list.parameters.find((parameter) => parameter.name === "budget");
    const pattern = new RegExp(budget!.schema.pattern);
    expect(pattern.test(BUDGET_BANDS.map((band) => band.key).join(","))).toBe(true);
    for (const band of BUDGET_BANDS) expect(pattern.test(band.key)).toBe(true);
    for (const value of ["", "cheap", "under_300,", "under_300,300_to_600,600_to_1000,1000_plus,under_300"]) expect(pattern.test(value)).toBe(false);
  });
});
