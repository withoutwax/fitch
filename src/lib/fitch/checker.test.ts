import { describe, expect, it } from "vitest";
import { checkProof } from "./checker";
import { equal, parseFormula, show } from "./formula";
import { PROBLEMS } from "./problems";
import { build, SOLUTIONS } from "./solutions";

describe("parser", () => {
  it("accepts ASCII and Unicode notation", () => {
    expect(equal(parseFormula("~(P & Q) -> R | S"), parseFormula("¬(P ∧ Q) → R ∨ S"))).toBe(true);
    expect(equal(parseFormula("Ax (P(x) -> Ey L(x,y))"), parseFormula("∀x (P(x) → ∃y L(x, y))"))).toBe(true);
    expect(equal(parseFormula("a != b"), parseFormula("¬a = b"))).toBe(true);
  });

  it("treats bound variables up to renaming", () => {
    expect(equal(parseFormula("∀x P(x)"), parseFormula("∀y P(y)"))).toBe(true);
    expect(equal(parseFormula("∀x P(x)"), parseFormula("∀y P(x)"))).toBe(false);
  });

  it("prints with conventional parentheses", () => {
    expect(show(parseFormula("P -> Q -> R"))).toBe("P → Q → R");
    expect(show(parseFormula("(P -> Q) -> R"))).toBe("(P → Q) → R");
    expect(show(parseFormula("~(P & Q)"))).toBe("¬(P ∧ Q)");
    expect(show(parseFormula("Ax (P(x) -> Q(x))"))).toBe("∀x (P(x) → Q(x))");
  });

  it("rejects malformed input", () => {
    expect(() => parseFormula("P ∧")).toThrow();
    expect(() => parseFormula("(P")).toThrow();
    expect(() => parseFormula("P Q")).toThrow();
  });
});

describe("problems", () => {
  it("has 58 problems, each with a model solution", () => {
    expect(PROBLEMS).toHaveLength(58);
    expect(PROBLEMS.map((p) => p.number)).toEqual(PROBLEMS.map((_, i) => i + 1));
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(58);
    for (const p of PROBLEMS) expect(SOLUTIONS[p.id], p.id).toBeDefined();
  });

  for (const p of PROBLEMS) {
    it(`#${p.number} ${p.title} is solvable`, () => {
      const rows = SOLUTIONS[p.id];
      const premises = rows.filter((r) => r[2] === "P").map((r) => r[1]);
      expect(premises.map((s) => show(parseFormula(s)))).toEqual(p.premises.map((s) => show(parseFormula(s))));
      const res = checkProof(build(rows), parseFormula(p.goal));
      expect(res.message).toBe("Proof complete!");
      expect(res.solved).toBe(true);
    });
  }
});

describe("checker rejects bad proofs", () => {
  const goal = (s: string) => parseFormula(s);

  it("wrong conclusion for a rule", () => {
    const r = checkProof(build([[0, "P ∧ Q", "P"], [0, "R", "andE", "1"]]), goal("R"));
    expect(r.valid).toBe(false);
    expect(r.lines[1].error).toMatch(/not a conjunct/);
  });

  it("citing a line inside a closed subproof", () => {
    const r = checkProof(
      build([
        [0, "P", "P"],
        [1, "Q", "A"],
        [1, "Q", "reit", "2"],
        [0, "Q", "reit", "3"],
      ]),
    );
    expect(r.lines[3].error).toMatch(/already ended/);
  });

  it("ending inside a subproof", () => {
    const r = checkProof(build([[0, "P", "P"], [1, "Q", "A"], [1, "P", "reit", "1"]]), goal("P"));
    expect(r.valid).toBe(true);
    expect(r.solved).toBe(false);
  });

  it("boxed constant that is not new", () => {
    const r = checkProof(
      build([
        [0, "P(c)", "P"],
        [1, "[c]", "A"],
        [1, "P(c)", "reit", "1"],
        [0, "∀x P(x)", "allI", "2-3"],
      ]),
      goal("∀x P(x)"),
    );
    expect(r.lines[1].error).toMatch(/must be new/);
  });

  it("∃E conclusion mentioning the boxed constant", () => {
    const r = checkProof(
      build([
        [0, "∃x P(x)", "P"],
        [1, "[c] P(c)", "A"],
        [0, "P(c)", "exE", "1, 2"],
      ]),
    );
    expect(r.lines[2].error).toMatch(/can't appear in the conclusion/);
  });

  it("→I with the wrong antecedent", () => {
    const r = checkProof(build([[1, "P", "A"], [1, "P", "reit", "1"], [0, "Q → P", "impI", "1-2"]]));
    expect(r.lines[2].error).toMatch(/antecedent/);
  });

  it("citing a subproof by a partial range", () => {
    const r = checkProof(build([[1, "P", "A"], [1, "P ∨ Q", "orI", "1"], [1, "P", "reit", "1"], [0, "P → P ∨ Q", "impI", "1-2"]]));
    expect(r.lines[3].error).toMatch(/ends at line 3/);
  });
});
