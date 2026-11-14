import { describe, expect, it } from "vitest";
import { display, toSymbols } from "./notation";
import { parseFormula, show } from "./formula";

describe("display", () => {
  it("leaves standard symbols alone", () => {
    expect(display("¬P ∧ Q → R ↔ S", "symbols")).toBe("¬P ∧ Q → R ↔ S");
  });
  it("uses keyboard symbols when simplified", () => {
    expect(display("¬P ∧ Q → R ↔ S", "simplified")).toBe("~P & Q => R <=> S");
    expect(display("¬(P ∨ Q)", "simplified")).toBe("~(P | Q)");
    expect(display("∧I", "simplified")).toBe("&I");
  });
});

describe("toSymbols", () => {
  it("reads every notation back to the formula it shows", () => {
    const formulas = ["¬P ∧ Q → R ↔ S", "¬¬(P ∨ Q)", "∀x (Cube(x) → ¬Small(x))", "(P ∧ Q) ∨ ¬R", "a ≠ b ∧ a = c"];
    for (const n of ["symbols", "simplified"] as const) {
      for (const f of formulas) {
        expect(show(parseFormula(toSymbols(display(f, n), n)))).toBe(show(parseFormula(f)));
      }
    }
  });
});
