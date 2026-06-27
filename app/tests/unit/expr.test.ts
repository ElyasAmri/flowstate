import { describe, it, expect } from "vitest";
import {
  evalExpr,
  evalGuard,
  type EvalContext,
} from "../../src/lib/flow/run/expr";

const ctx = (
  vars: Record<string, string | number | boolean>,
  outcome: Record<string, string | number | boolean> | null = null,
): EvalContext => ({
  vars,
  outcome,
});

describe("evalExpr / evalGuard", () => {
  it("reads vars and outcome paths", () => {
    expect(evalExpr("addr_verdict", ctx({ addr_verdict: "sufficient" }))).toBe(
      "sufficient",
    );
    expect(evalExpr("outcome.text", ctx({}, { text: "hi" }))).toBe("hi");
    expect(evalExpr("outcome.exit", ctx({}, { exit: 0 }))).toBe(0);
    // Unknown path is total -> benign false, never a throw.
    expect(evalExpr("ghost", ctx({}))).toBe(false);
    expect(evalExpr("outcome.text", ctx({}, null))).toBe(false);
  });

  it("evaluates string and numeric comparisons", () => {
    expect(
      evalGuard(
        'addr_verdict == "sufficient"',
        ctx({ addr_verdict: "sufficient" }),
      ),
    ).toBe(true);
    expect(
      evalGuard(
        'addr_verdict == "sufficient"',
        ctx({ addr_verdict: "ambiguous" }),
      ),
    ).toBe(false);
    expect(evalGuard("outcome.exit == 0", ctx({}, { exit: 0 }))).toBe(true);
    expect(evalGuard("outcome.exit == 0", ctx({}, { exit: 1 }))).toBe(false);
    expect(evalGuard("n >= 3", ctx({ n: 5 }))).toBe(true);
    expect(evalGuard("n >= 3", ctx({ n: 2 }))).toBe(false);
  });

  it("evaluates boolean logic, negation, and grouping", () => {
    expect(evalGuard('a == 1 && b == "x"', ctx({ a: 1, b: "x" }))).toBe(true);
    expect(evalGuard('a == 1 && b == "x"', ctx({ a: 1, b: "y" }))).toBe(false);
    expect(evalGuard("a == 1 || a == 2", ctx({ a: 2 }))).toBe(true);
    expect(evalGuard("!(a == 1)", ctx({ a: 2 }))).toBe(true);
  });

  it("returns string literals verbatim (for set right-hand sides)", () => {
    expect(evalExpr('"issued"', ctx({}))).toBe("issued");
    expect(evalExpr("'rejected'", ctx({}))).toBe("rejected");
  });

  it("treats truthiness like the harness", () => {
    expect(evalGuard("flag", ctx({ flag: true }))).toBe(true);
    expect(evalGuard("name", ctx({ name: "" }))).toBe(false);
    expect(evalGuard("name", ctx({ name: "x" }))).toBe(true);
    expect(evalGuard("count", ctx({ count: 0 }))).toBe(false);
  });
});
