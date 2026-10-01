import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  getFormulaIdentifiers,
  validateFormulaSyntax
} from "../electron/shared/formula";

const values = { price: 100, eps: 4, pe: 25, revenue: 2_000, zero: 0, missing: null, label: "text" };

describe("evaluateFormula", () => {
  it("evaluates arithmetic with the usual precedence", () => {
    expect(evaluateFormula("price / eps", values)).toBe(25);
    expect(evaluateFormula("1 + 2 * 3", values)).toBe(7);
    expect(evaluateFormula("(1 + 2) * 3", values)).toBe(9);
  });

  it("is left-associative for subtraction and division", () => {
    expect(evaluateFormula("10 - 4 - 3", values)).toBe(3);
    expect(evaluateFormula("100 / 5 / 2", values)).toBe(10);
  });

  it("returns null instead of Infinity when dividing by zero", () => {
    expect(evaluateFormula("price / zero", values)).toBeNull();
  });

  it("returns null when a metric is missing or null", () => {
    expect(evaluateFormula("price / missing", values)).toBeNull();
    expect(evaluateFormula("price / nope", values)).toBeNull();
  });

  it("returns null for a text value rather than guessing", () => {
    expect(evaluateFormula("price / label", values)).toBeNull();
  });

  it("does not read a date string as the number at its start", () => {
    expect(evaluateFormula("price / earningsDate", { price: 100, earningsDate: "2026-11-05" })).toBeNull();
  });

  it("accepts numeric strings with thousands separators", () => {
    expect(evaluateFormula("a + 1", { a: "1,000" })).toBe(1001);
  });
});

describe("validateFormulaSyntax", () => {
  it("accepts valid formulas", () => {
    expect(() => validateFormulaSyntax("price / (eps * 2)")).not.toThrow();
  });

  it.each([
    ["", /empty/i],
    ["price /", /incomplete|wrong place/i],
    ["* price", /wrong place/i],
    ["price eps", /missing an operator/i],
    ["(price", /mismatched/i],
    ["price)", /mismatched/i],
    ["()", /empty or invalid/i],
    ["price $ eps", /can only use/i]
  ])("rejects %j", (formula, message) => {
    expect(() => validateFormulaSyntax(formula)).toThrow(message);
  });
});

describe("getFormulaIdentifiers", () => {
  it("lists each metric id once", () => {
    expect(getFormulaIdentifiers("price / eps + price * 2").sort()).toEqual(["eps", "price"]);
  });
});
