import { describe, expect, it } from "vitest";
import { demoBookingFormSchema } from "./submission";
import { sampleEventDetails } from "./sample";

describe("sample event details", () => {
  it("picks a name, venue and that venue's made-up address from the lists, at both ends of the range", () => {
    expect(sampleEventDetails(() => 0)).toEqual({ eventName: "Friday Night Social", venueName: "The Copper Room", venueAddress: "101 Example Ave, Atlanta, GA 30303" });
    expect(sampleEventDetails(() => 0.9999)).toEqual({ eventName: "Soulful Sunday Session", venueName: "Harbor Loft", venueAddress: "1010 Sample Pier, Atlanta, GA 30318" });
  });

  it("always fits the demo form's limits", () => {
    for (let i = 0; i < 50; i++) {
      const { eventName, venueName, venueAddress } = sampleEventDetails();
      expect(demoBookingFormSchema.shape.venue_address.safeParse(venueAddress).success).toBe(true);
      expect(demoBookingFormSchema.shape.event_name.safeParse(eventName).success).toBe(true);
      expect(demoBookingFormSchema.shape.venue_name.safeParse(venueName).success).toBe(true);
    }
  });
});
