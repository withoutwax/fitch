import { describe, expect, it } from "vitest";
import { checkProof } from "./checker";
import { equal, parseFormula, show } from "./formula";
import { PROBLEMS } from "../../../seed/problems";
import { build, SOLUTIONS } from "../../../seed/solutions";

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
  it("has 100 problems, each with a model solution", () => {
    expect(PROBLEMS).toHaveLength(100);
    expect(PROBLEMS.map((p) => p.number)).toEqual(PROBLEMS.map((_, i) => i + 1));
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(100);
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

describe("Stanford Fitch rule behavior", () => {
  it("uses two elimination steps to reach a nested conjunct", () => {
    const skipped = build([[0, "(P ∧ Q) ∧ R", "P"], [0, "Q", "andE", "1"]]);
    const complete = build([[0, "(P ∧ Q) ∧ R", "P"], [0, "P ∧ Q", "andE", "1"], [0, "Q", "andE", "2"]]);
    expect(checkProof(skipped).valid).toBe(false);
    expect(checkProof(complete).valid).toBe(true);
  });

  it("uses a direct disjunct for Or Introduction", () => {
    const lines = build([[0, "Q", "P"], [0, "(P ∨ Q) ∨ R", "orI", "1"]]);
    expect(checkProof(lines).valid).toBe(false);
  });

  it("reiterates independent work from a closed subproof", () => {
    const lines = build([
      [0, "P", "P"], [1, "Q", "A"], [1, "P", "reit", "1"],
      [0, "Q → P", "impI", "2-3"], [0, "P", "reit", "3"],
    ]);
    expect(checkProof(lines).valid).toBe(true);
  });

  it("requires matching quantifier binders in Existential Elimination", () => {
    const lines = build([[0, "∃x P(x)", "P"], [0, "∀y (P(y) → Q)", "P"], [0, "Q", "exE", "1, 2"]]);
    expect(checkProof(lines).valid).toBe(false);
  });

  it("requires a witness occurrence in Existential Introduction", () => {
    const lines = build([[0, "P(a)", "P"], [0, "∃x P(a)", "exI", "1"]]);
    expect(checkProof(lines).valid).toBe(false);
  });

  it("distinguishes a declared object constant from a placeholder", () => {
    const lines = build([[0, "a = a", "eqI"], [0, "∀x (x = x)", "allI", "1"]]);
    expect(checkProof(lines).valid).toBe(true);
    expect(checkProof(lines, undefined, { vocabulary: { objects: ["a"], functions: [] } }).valid).toBe(false);
  });

  it("accepts a truth-table step only when the proof enables it", () => {
    const rows = build([[0, "p", "P"]]);
    rows.push({ id: "truth-table-step", depth: 0, kind: "step", text: "¬¬p", rule: "truthTable", refs: "1" });
    const goal = parseFormula("¬¬p");
    expect(checkProof(rows, goal).solved).toBe(false);
    expect(checkProof(rows, goal, { allowAdvanced: true }).solved).toBe(true);
  });

  it("uses a compound term as a universal instance and in reflexivity", () => {
    const lines = build([[0, "∀x P(x)", "P"], [0, "P(f(a))", "allE", "1"], [0, "f(a) = f(a)", "eqI"]]);
    expect(checkProof(lines).valid).toBe(true);
  });
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

  it("¬I from a subproof, the old way", () => {
    const r = checkProof(build([[0, "¬Q", "P"], [1, "Q", "A"], [1, "⊥", "botI", "2, 1"], [0, "¬Q", "notI", "2-3"]]));
    expect(r.lines[3].error).toMatch(/cites two lines/);
  });

  it("¬I with conditionals that don't contradict", () => {
    const r = checkProof(build([[0, "P → Q", "P"], [0, "P → ¬R", "P"], [0, "¬P", "notI", "1, 2"]]));
    expect(r.lines[2].error).toMatch(/¬I needs/);
  });

  it("⊥E concludes the negated assumption, not anything", () => {
    const ok = checkProof(build([[0, "¬Q", "P"], [1, "Q", "A"], [1, "⊥", "botI", "2, 1"], [0, "¬Q", "botE", "2-3"]]));
    expect(ok.valid).toBe(true);
    const r = checkProof(build([[0, "P", "P"], [0, "¬P", "P"], [0, "⊥", "botI", "1, 2"], [0, "R", "botE", "3"]]));
    expect(r.lines[3].error).toMatch(/cites one subproof/);
  });

  it("∀I on a name that appears in a premise", () => {
    const r = checkProof(build([[0, "P(c)", "P"], [0, "∀x P(x)", "allI", "1"]]));
    expect(r.lines[1].error).toMatch(/can't be generalized/);
  });

  it("∀I on a name in an open assumption", () => {
    const r = checkProof(build([[1, "P(c)", "A"], [1, "∀x P(x)", "allI", "1"]]));
    expect(r.lines[1].error).toMatch(/can't be generalized/);
  });

  it("∀I must replace every occurrence", () => {
    const r = checkProof(build([[0, "∀x R(x, x)", "P"], [0, "R(c, c)", "allE", "1"], [0, "∀x R(x, c)", "allI", "2"]]));
    expect(r.valid).toBe(false);
  });

  it("∃E with a conclusion that still mentions the variable", () => {
    const r = checkProof(build([[0, "∃x P(x)", "P"], [0, "∀x (P(x) → Q(x))", "P"], [0, "Q(x)", "exE", "1, 2"]]));
    expect(r.valid).toBe(false);
  });

  it("→I with the wrong antecedent", () => {
    const r = checkProof(build([[1, "P", "A"], [1, "P", "reit", "1"], [0, "Q → P", "impI", "1-2"]]));
    expect(r.lines[2].error).toMatch(/antecedent/);
  });

  it("cannot introduce an implication from an inner assumption that was never discharged", () => {
    const r = checkProof(build([[1, "P", "A"], [2, "Q", "A"], [0, "P → Q", "impI", "1-2"]]), goal("P → Q"));
    expect(r.solved).toBe(false);
    expect(r.lines[2].error).toMatch(/nested assumption/);
  });

  it("cannot discharge an outer assumption using a contradiction inside an unfinished inner subproof", () => {
    const r = checkProof(build([
      [0, "¬Q", "P"],
      [1, "P", "A"],
      [2, "Q", "A"],
      [2, "⊥", "botI", "1, 3"],
      [0, "¬P", "botE", "2-4"],
    ]), goal("¬P"));
    expect(r.solved).toBe(false);
    expect(r.lines[4].error).toMatch(/nested assumption/);
  });

  it("citing a subproof by a partial range", () => {
    const r = checkProof(build([[1, "P", "A"], [1, "P ∨ Q", "orI", "1"], [1, "P", "reit", "1"], [0, "P → P ∨ Q", "impI", "1-2"]]));
    expect(r.lines[3].error).toMatch(/ends at line 3/);
  });
});
