import { describe, expect, it } from "vitest";
import { checkProof, type LineKind, type ProofLine } from "./checker";
import { equal, parseFormula, show } from "./formula";
import { PROBLEMS } from "./problems";
import type { RuleId } from "./rules";

// Compact proof notation: [depth, text, rule, refs]. Rule "A" marks an
// assumption and "P" a premise.
type Row = [number, string, RuleId | "A" | "P", string?];

function build(rows: Row[]): ProofLine[] {
  return rows.map(([depth, text, rule, refs = ""], i) => {
    const kind: LineKind = rule === "P" ? "premise" : rule === "A" ? "assumption" : "step";
    return { id: String(i), depth, kind, text, rule: kind === "step" ? (rule as RuleId) : "", refs };
  });
}

const SOLUTIONS: Record<string, Row[]> = {
  "conjunction-swap": [
    [0, "P ∧ Q", "P"],
    [0, "P", "andE", "1"],
    [0, "Q", "andE", "1"],
    [0, "Q ∧ P", "andI", "3, 2"],
  ],
  "chain-of-conditionals": [
    [0, "P → Q", "P"],
    [0, "Q → R", "P"],
    [0, "P", "P"],
    [0, "Q", "impE", "1, 3"],
    [0, "R", "impE", "2, 4"],
  ],
  weakening: [
    [0, "P ∧ Q", "P"],
    [0, "P", "andE", "1"],
    [0, "P ∨ R", "orI", "2"],
  ],
  "double-negation-intro": [
    [0, "P", "P"],
    [1, "¬P", "A"],
    [1, "⊥", "botI", "1, 2"],
    [0, "¬¬P", "notI", "2-3"],
  ],
  "modus-tollens": [
    [0, "P → Q", "P"],
    [0, "¬Q", "P"],
    [1, "P", "A"],
    [1, "Q", "impE", "1, 3"],
    [1, "⊥", "botI", "4, 2"],
    [0, "¬P", "notI", "3-5"],
  ],
  "disjunction-swap": [
    [0, "P ∨ Q", "P"],
    [1, "P", "A"],
    [1, "Q ∨ P", "orI", "2"],
    [1, "Q", "A"],
    [1, "Q ∨ P", "orI", "4"],
    [0, "Q ∨ P", "orE", "1, 2-3, 4-5"],
  ],
  "transitivity-of-identity": [
    [0, "a = b", "P"],
    [0, "b = c", "P"],
    [0, "a = c", "eqE", "1, 2"],
  ],
  "hypothetical-syllogism": [
    [0, "P → Q", "P"],
    [0, "Q → R", "P"],
    [1, "P", "A"],
    [1, "Q", "impE", "1, 3"],
    [1, "R", "impE", "2, 4"],
    [0, "P → R", "impI", "3-5"],
  ],
  contraposition: [
    [0, "P → Q", "P"],
    [1, "¬Q", "A"],
    [2, "P", "A"],
    [2, "Q", "impE", "1, 3"],
    [2, "⊥", "botI", "4, 2"],
    [1, "¬P", "notI", "3-5"],
    [0, "¬Q → ¬P", "impI", "2-6"],
  ],
  exportation: [
    [0, "(P ∧ Q) → R", "P"],
    [1, "P", "A"],
    [2, "Q", "A"],
    [2, "P ∧ Q", "andI", "2, 3"],
    [2, "R", "impE", "1, 4"],
    [1, "Q → R", "impI", "3-5"],
    [0, "P → (Q → R)", "impI", "2-6"],
  ],
  "disjunctive-syllogism": [
    [0, "P ∨ Q", "P"],
    [0, "¬P", "P"],
    [1, "P", "A"],
    [1, "⊥", "botI", "3, 2"],
    [1, "Q", "botE", "4"],
    [1, "Q", "A"],
    [0, "Q", "orE", "1, 3-5, 6"],
  ],
  distribution: [
    [0, "P ∧ (Q ∨ R)", "P"],
    [0, "P", "andE", "1"],
    [0, "Q ∨ R", "andE", "1"],
    [1, "Q", "A"],
    [1, "P ∧ Q", "andI", "2, 4"],
    [1, "(P ∧ Q) ∨ (P ∧ R)", "orI", "5"],
    [1, "R", "A"],
    [1, "P ∧ R", "andI", "2, 7"],
    [1, "(P ∧ Q) ∨ (P ∧ R)", "orI", "8"],
    [0, "(P ∧ Q) ∨ (P ∧ R)", "orE", "3, 4-6, 7-9"],
  ],
  "de-morgan-or": [
    [0, "¬(P ∨ Q)", "P"],
    [1, "P", "A"],
    [1, "P ∨ Q", "orI", "2"],
    [1, "⊥", "botI", "3, 1"],
    [0, "¬P", "notI", "2-4"],
    [1, "Q", "A"],
    [1, "P ∨ Q", "orI", "6"],
    [1, "⊥", "botI", "7, 1"],
    [0, "¬Q", "notI", "6-8"],
    [0, "¬P ∧ ¬Q", "andI", "5, 9"],
  ],
  "transitivity-of-biconditional": [
    [0, "P ↔ Q", "P"],
    [0, "Q ↔ R", "P"],
    [1, "P", "A"],
    [1, "Q", "iffE", "1, 3"],
    [1, "R", "iffE", "2, 4"],
    [1, "R", "A"],
    [1, "Q", "iffE", "2, 6"],
    [1, "P", "iffE", "1, 7"],
    [0, "P ↔ R", "iffI", "3-5, 6-8"],
  ],
  "universal-modus-ponens": [
    [0, "∀x (P(x) → Q(x))", "P"],
    [0, "∀x P(x)", "P"],
    [1, "[c]", "A"],
    [1, "P(c) → Q(c)", "allE", "1"],
    [1, "P(c)", "allE", "2"],
    [1, "Q(c)", "impE", "4, 5"],
    [0, "∀x Q(x)", "allI", "3-6"],
  ],
  "existential-transfer": [
    [0, "∀x (P(x) → Q(x))", "P"],
    [0, "∃x P(x)", "P"],
    [1, "[c] P(c)", "A"],
    [1, "P(c) → Q(c)", "allE", "1"],
    [1, "Q(c)", "impE", "4, 3"],
    [1, "∃x Q(x)", "exI", "5"],
    [0, "∃x Q(x)", "exE", "2, 3-6"],
  ],
  "excluded-middle": [
    [1, "¬(P ∨ ¬P)", "A"],
    [2, "P", "A"],
    [2, "P ∨ ¬P", "orI", "2"],
    [2, "⊥", "botI", "3, 1"],
    [1, "¬P", "notI", "2-4"],
    [1, "P ∨ ¬P", "orI", "5"],
    [1, "⊥", "botI", "6, 1"],
    [0, "¬¬(P ∨ ¬P)", "notI", "1-7"],
    [0, "P ∨ ¬P", "notE", "8"],
  ],
  "de-morgan-and": [
    [0, "¬(P ∧ Q)", "P"],
    [1, "¬(¬P ∨ ¬Q)", "A"],
    [2, "¬P", "A"],
    [2, "¬P ∨ ¬Q", "orI", "3"],
    [2, "⊥", "botI", "4, 2"],
    [1, "¬¬P", "notI", "3-5"],
    [1, "P", "notE", "6"],
    [2, "¬Q", "A"],
    [2, "¬P ∨ ¬Q", "orI", "8"],
    [2, "⊥", "botI", "9, 2"],
    [1, "¬¬Q", "notI", "8-10"],
    [1, "Q", "notE", "11"],
    [1, "P ∧ Q", "andI", "7, 12"],
    [1, "⊥", "botI", "13, 1"],
    [0, "¬¬(¬P ∨ ¬Q)", "notI", "2-14"],
    [0, "¬P ∨ ¬Q", "notE", "15"],
  ],
  "quantifier-negation": [
    [0, "¬∃x P(x)", "P"],
    [1, "[c]", "A"],
    [2, "P(c)", "A"],
    [2, "∃x P(x)", "exI", "3"],
    [2, "⊥", "botI", "4, 1"],
    [1, "¬P(c)", "notI", "3-5"],
    [0, "∀x ¬P(x)", "allI", "2-6"],
  ],
  "quantifier-swap": [
    [0, "∃x ∀y L(x, y)", "P"],
    [1, "[d]", "A"],
    [2, "[c] ∀y L(c, y)", "A"],
    [2, "L(c, d)", "allE", "3"],
    [2, "∃x L(x, d)", "exI", "4"],
    [1, "∃x L(x, d)", "exE", "1, 3-5"],
    [0, "∀y ∃x L(x, y)", "allI", "2-6"],
  ],
};

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
  it("has 20 problems, each with a model solution", () => {
    expect(PROBLEMS).toHaveLength(20);
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
