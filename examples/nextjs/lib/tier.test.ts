import { describe, expect, it } from "vitest";
import { parseTier, placementFor } from "./tier";

describe("demo integration tier (GEL-917)", () => {
  it("is Full unless Light was chosen, so an old or odd cookie shows the full demo", () => {
    expect(parseTier("light")).toBe("light");
    expect(parseTier("full")).toBe("full");
    expect(parseTier(undefined)).toBe("full");
    expect(parseTier("LIGHT")).toBe("full");
    expect(parseTier("admin")).toBe("full");
  });

  it("takes the card hold on this site in Full, and in Gelatin's portal in Light", () => {
    expect(placementFor("full")).toBe("partner_event_flow");
    expect(placementFor("light")).toBe("gelatin_portal_handoff");
  });
});
