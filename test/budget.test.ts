import { describe, expect, it } from "vitest";
import { BUDGET_BANDS, isBudgetBand, orderBudgetBands } from "../src/budget.js";

describe("budget bands", () => {
  it("cover every rate from zero up with no gaps or overlaps", () => {
    expect(BUDGET_BANDS.map((band) => band.key)).toEqual(["under_300", "300_to_600", "600_to_1000", "1000_plus"]);
    expect(BUDGET_BANDS[0].min_cents).toBe(0);
    for (let i = 1; i < BUDGET_BANDS.length; i++) expect(BUDGET_BANDS[i].min_cents).toBe(BUDGET_BANDS[i - 1].max_cents);
    expect(BUDGET_BANDS.at(-1)?.max_cents).toBeNull();
  });

  it("recognises only the band keys", () => {
    expect(isBudgetBand("300_to_600")).toBe(true);
    for (const value of ["", "cheap", "UNDER_300", "__proto__", 30000, null]) expect(isBudgetBand(value)).toBe(false);
    expect(orderBudgetBands(["1000_plus", "under_300", "1000_plus"])).toEqual(["under_300", "1000_plus"]);
  });
});
