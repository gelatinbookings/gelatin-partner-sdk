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
      "/v1/partners/{partner}/djs/{id}",
      "/v1/partners/{partner}/djs/{id}/availability",
      "/v1/partners/{partner}/cities",
      "/v1/partners/{partner}/city-waitlist",
      "/v1/partners/{partner}/genres",
      "/v1/partners/{partner}/booking-requests",
      "/v1/partners/{partner}/bookings/{booking_id}/cancel",
      "/v1/partners/{partner}/bookings/{booking_id}/cancel/preview",
      "/v1/partners/{partner}/dj-request-submissions",
      "/v1/partners/{partner}/events/{external_event_id}",
      "/v1/partners/{partner}/events/{external_event_id}/attendance",
      "/v1/partners/{partner}/events/{external_event_id}/dj-bookings",
      "/v1/partners/{partner}/events/{external_event_id}/dj-bookings/{request_id}/alternates",
      "/v1/partners/{partner}/events/{external_event_id}/lineup",
      "/v1/partners/{partner}/launch-sessions",
      "/v1/partners/{partner}/organizers/{community_ref}/standing",
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
    expect(ids.size).toBe(19);
  });

  it("reads a community's standing pull-only, and refuses creates while it owes", () => {
    const paths = spec.paths as Record<string, Record<string, { operationId: string; parameters: Array<{ name: string; in: string }>; responses: Record<string, { description?: string; content?: Record<string, { schema: { $ref: string } }> }> }>>;
    const standing = paths["/v1/partners/{partner}/organizers/{community_ref}/standing"].get;
    expect(standing.operationId).toBe("getOrganizerStanding");
    expect(standing.responses["200"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/OrganizerStanding");
    expect(standing.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["path:partner", "path:community_ref", "query:external_user_id"]);
    expect(paths["/v1/partners/{partner}/booking-requests"].post.responses["403"].description).toContain("organizer_owes");
    const schemas = (spec.components as { schemas: Record<string, { properties: Record<string, unknown>; enum?: string[] }> }).schemas;
    expect(schemas.PartnerDeal.enum).toEqual(["confirm_and_book", "make_a_deal"]);
    expect(Object.keys(schemas.IndependentDjRequest.properties)).toContain("deal");
    expect(Object.keys(schemas.Organizer.properties)).toContain("community_ref");
  });

  it("needs only the event and organizer IDs to submit; the rest are optional or deprecated", () => {
    type Schema = { required?: string[]; properties: Record<string, { deprecated?: boolean; description?: string }> };
    const schemas = (spec.components as { schemas: Record<string, Schema> }).schemas;
    const submission = schemas.DjRequestSubmission;
    expect(submission.required).toEqual(["external_event_id", "organizer", "event", "requests", "authorization_placement", "return_url"]);
    expect(submission.properties.external_submission_id.deprecated).toBe(true);
    expect(submission.properties.external_booking_id.description).toMatch(/Idempotency-Key/);
    expect(schemas.IndependentDjRequest.required).toEqual(["dj_id", "initial_offer"]);
    expect(schemas.Organizer.required).toContain("external_user_id");
    const error = (schemas.ApiError.properties.error as unknown as Schema).properties;
    expect(Object.keys(error)).toContain("dj_id");
  });

  it("previews and cancels one DJ's booking under requests:write, both returning the plan", () => {
    const paths = spec.paths as Record<string, Record<string, { operationId: string; parameters: Array<{ name: string; in: string }>; responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }> }>>;
    const preview = paths["/v1/partners/{partner}/bookings/{booking_id}/cancel/preview"].post;
    const cancel = paths["/v1/partners/{partner}/bookings/{booking_id}/cancel"].post;
    expect([preview.operationId, cancel.operationId]).toEqual(["previewCancellation", "cancelBooking"]);
    expect(preview.responses["200"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/CancellationPreview");
    expect(cancel.responses["200"].content?.["application/json"].schema.$ref).toBe("#/components/schemas/CancellationResult");
    expect(Object.keys(cancel.responses)).toContain("409");
    const schemas = (spec.components as { schemas: Record<string, { required: string[] }> }).schemas;
    expect(schemas.CancellationResult.required).toEqual(expect.arrayContaining([...schemas.CancellationPreview.required, "status", "already_cancelled"]));
  });

  it("documents the catalog's available filter as true-only and needing a date", () => {
    const paths = spec.paths as Record<string, Record<string, { parameters: Array<{ name: string; in: string; required?: boolean; schema: { type: string; enum?: string[] }; description: string }> }>>;
    const available = paths["/v1/partners/{partner}/djs"].get.parameters.find((parameter) => parameter.name === "available");
    expect(available).toMatchObject({ in: "query", schema: { type: "string", enum: ["true"] } });
    expect(available?.required ?? false).toBe(false);
    expect(available?.description).toMatch(/date/);
  });

  it("reads one DJ's public profile and availability under catalog:read, with no contact fields", () => {
    type Operation = { operationId: string; description: string; parameters: Array<{ name: string; in: string; required?: boolean }>; responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }> };
    const paths = spec.paths as Record<string, Record<string, Operation>>;
    const dj = paths["/v1/partners/{partner}/djs/{id}"].get;
    const availability = paths["/v1/partners/{partner}/djs/{id}/availability"].get;
    expect([dj.operationId, availability.operationId]).toEqual(["getPartnerDj", "getPartnerDjAvailability"]);
    for (const operation of [dj, availability]) {
      expect(operation.description).toMatch(/^Requires catalog:read\. Mounted\./);
      expect(Object.keys(operation.responses)).toEqual(expect.arrayContaining(["200", "304", "400", "404"]));
    }
    expect(dj.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["path:partner", "path:id", "header:If-None-Match"]);
    expect(availability.parameters.filter((parameter) => parameter.in === "query").map((parameter) => [parameter.name, parameter.required])).toEqual([["from", true], ["to", true], ["time_zone", false]]);
    type Schema = { required: string[]; additionalProperties: boolean; properties: Record<string, { items?: { properties: Record<string, unknown> } }> };
    const schemas = (spec.components as { schemas: Record<string, Schema> }).schemas;
    const detail = schemas.PartnerDjDetail;
    expect(detail.additionalProperties).toBe(false);
    expect([...detail.required].sort()).toEqual(Object.keys(detail.properties).sort());
    for (const forbidden of ["email", "phone", "contact", "reviewer", "stripe", "payout", "min_rate"]) {
      expect(JSON.stringify(Object.keys(detail.properties))).not.toContain(forbidden);
    }
    expect(Object.keys(detail.properties.reviews.items!.properties).sort()).toEqual(["date", "text", "venue_name"]);
    expect(Object.keys(schemas.DjAvailability.properties.days.items!.properties).sort()).toEqual(["date", "status"]);
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
    // The booking ID is still modelled, now optional: the Idempotency-Key stands in for it.
    expect(schemas.DjRequestSubmission.properties).toHaveProperty("external_booking_id");
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
    // One checkout for every DJ: the same route and result, with the event's DJ count, and a book-and-pay flag on submission.
    const described = spec.components as { schemas: Record<string, { properties: Record<string, { oneOf?: Array<{ properties: { kind: { enum: string[] } } }>; enum?: string[] }> }> };
    expect(described.schemas.PaymentSessionRequest.properties.resource.oneOf?.map((option) => option.properties.kind.enum[0])).toEqual(["request", "event"]);
    expect(Object.keys(described.schemas.PaymentSessionResult.properties)).toContain("dj_count");
    expect(described.schemas.DjRequestSubmission.properties.payment.enum).toEqual(["event_checkout"]);
    expect(Object.keys(described.schemas.BookingRequestResult.properties)).toEqual(expect.arrayContaining(["event_checkout", "event_checkout_error"]));
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
    // profile_page_url sits beside the deprecated profile_url.
    expect(Object.keys(schemas.LineupEntry.properties ?? {}).sort()).toEqual(["dj_id", "image_url", "name", "profile_page_url", "profile_url", "set_ends_at", "set_starts_at", "sound", "status"]);
    expect((schemas.LineupEntry.properties?.profile_url as { deprecated?: boolean }).deprecated).toBe(true);
    // Additive: a partner reading the older shape keeps working.
    expect(schemas.LineupEntry.required).toEqual(["dj_id", "name", "status", "profile_url", "image_url"]);
    expect(schemas.LineupEntry.properties?.status.enum).toEqual(["confirmed", "pending"]);
  });

  it("lets the partner pass the organizer's set time to the catalog and the submission", () => {
    const paths = spec.paths as Record<string, Record<string, { parameters: Array<{ name: string }> }>>;
    const names = paths["/v1/partners/{partner}/djs"].get.parameters.map((parameter) => parameter.name);
    expect(names).toEqual(expect.arrayContaining(["set_starts_at", "set_ends_at", "time_zone"]));
    const schemas = (spec.components as { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> }).schemas;
    expect(Object.keys(schemas.IndependentDjRequest.properties ?? {})).toEqual(expect.arrayContaining(["set_starts_at", "set_ends_at"]));
    expect(schemas.IndependentDjRequest.required).toEqual(["dj_id", "initial_offer"]);
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
