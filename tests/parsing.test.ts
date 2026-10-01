import { describe, expect, it } from "vitest";
import {
  parseCnbcDate,
  parsePercent,
  parseScaledNumber,
  safeFloat
} from "../electron/providers/cnbcProvider";

describe("safeFloat", () => {
  it("parses plain and comma-separated numbers", () => {
    expect(safeFloat("1.25")).toBe(1.25);
    expect(safeFloat("1,234.5")).toBe(1234.5);
  });

  it("keeps the sign of negative numbers", () => {
    expect(safeFloat("-1.25")).toBe(-1.25);
    expect(safeFloat("-1,234.5")).toBe(-1234.5);
  });

  it("accepts a Unicode minus sign", () => {
    expect(safeFloat("\u22121.25")).toBe(-1.25);
  });

  it("returns null for placeholders and empty input", () => {
    for (const value of ["-", "–", "—", "", "   ", undefined, null]) {
      expect(safeFloat(value as string | undefined)).toBeNull();
    }
  });

  it("returns null for text that is not a number", () => {
    expect(safeFloat("N/A")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("parses positive and negative percentages", () => {
    expect(parsePercent("12.5%")).toBe(12.5);
    expect(parsePercent("-0.45%")).toBe(-0.45);
  });

  it("returns null for the placeholder", () => {
    expect(parsePercent("-")).toBeNull();
    expect(parsePercent(undefined)).toBeNull();
  });
});

describe("parseScaledNumber", () => {
  it("expands T, B and M suffixes", () => {
    expect(parseScaledNumber("2.5T")).toBe(2_500_000_000_000);
    expect(parseScaledNumber("12.5B")).toBe(12_500_000_000);
    expect(parseScaledNumber("340M")).toBe(340_000_000);
  });

  it("handles a negative scaled value", () => {
    expect(parseScaledNumber("-1.5B")).toBe(-1_500_000_000);
  });

  it("handles an unscaled value with commas", () => {
    expect(parseScaledNumber("1,234")).toBe(1234);
  });

  it("returns null for the placeholder and for nothing", () => {
    expect(parseScaledNumber("-")).toBeNull();
    expect(parseScaledNumber(undefined)).toBeNull();
  });
});

describe("parseCnbcDate", () => {
  it("converts M/D/YYYY to ISO", () => {
    expect(parseCnbcDate("11/05/2026")).toBe("2026-11-05");
    expect(parseCnbcDate("1/2/2027")).toBe("2027-01-02");
  });

  it("strips the (est) marker", () => {
    expect(parseCnbcDate("11/05/2026 (est)")).toBe("2026-11-05");
  });

  it("returns null for the placeholder and for malformed dates", () => {
    expect(parseCnbcDate("-")).toBeNull();
    expect(parseCnbcDate("2026-11-05")).toBeNull();
    expect(parseCnbcDate("not a date")).toBeNull();
  });
});
