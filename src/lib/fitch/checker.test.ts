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
  "conjunction-association": [
    [0, "(P ∧ Q) ∧ R", "P"],
    [0, "P ∧ Q", "andE", "1"],
    [0, "P", "andE", "2"],
    [0, "Q", "andE", "2"],
    [0, "R", "andE", "1"],
    [0, "Q ∧ R", "andI", "4, 5"],
    [0, "P ∧ (Q ∧ R)", "andI", "3, 6"],
  ],
  "biconditional-elim": [
    [0, "P ↔ Q", "P"],
    [0, "Q", "P"],
    [0, "P", "iffE", "1, 2"],
  ],
  explosion: [
    [0, "P", "P"],
    [0, "¬P", "P"],
    [0, "⊥", "botI", "1, 2"],
    [0, "Q", "botE", "3"],
  ],
  "double-negation-elim": [
    [0, "¬¬P", "P"],
    [0, "P", "notE", "1"],
  ],
  "symmetry-of-identity": [
    [0, "a = b", "P"],
    [0, "a = a", "eqI"],
    [0, "b = a", "eqE", "2, 1"],
  ],
  indiscernibility: [
    [0, "P(a)", "P"],
    [0, "a = b", "P"],
    [0, "P(b)", "eqE", "1, 2"],
  ],
  "universal-instantiation": [
    [0, "∀x (P(x) → Q(x))", "P"],
    [0, "P(a)", "P"],
    [0, "P(a) → Q(a)", "allE", "1"],
    [0, "Q(a)", "impE", "3, 2"],
  ],
  "existential-generalization": [
    [0, "P(a) ∧ Q(a)", "P"],
    [0, "Q(a)", "andE", "1"],
    [0, "∃x Q(x)", "exI", "2"],
  ],
  "self-implication": [
    [1, "P", "A"],
    [1, "P", "reit", "1"],
    [0, "P → P", "impI", "1-2"],
  ],
  "conjunction-to-conditional": [
    [0, "P ∧ Q", "P"],
    [1, "P", "A"],
    [1, "Q", "andE", "1"],
    [0, "P → Q", "impI", "2-3"],
  ],
  "constructive-dilemma": [
    [0, "P ∨ Q", "P"],
    [0, "P → R", "P"],
    [0, "Q → S", "P"],
    [1, "P", "A"],
    [1, "R", "impE", "2, 4"],
    [1, "R ∨ S", "orI", "5"],
    [1, "Q", "A"],
    [1, "S", "impE", "3, 7"],
    [1, "R ∨ S", "orI", "8"],
    [0, "R ∨ S", "orE", "1, 4-6, 7-9"],
  ],
  importation: [
    [0, "P → (Q → R)", "P"],
    [1, "P ∧ Q", "A"],
    [1, "P", "andE", "2"],
    [1, "Q", "andE", "2"],
    [1, "Q → R", "impE", "1, 3"],
    [1, "R", "impE", "5, 4"],
    [0, "(P ∧ Q) → R", "impI", "2-6"],
  ],
  "conditional-conjunction": [
    [0, "P → Q", "P"],
    [0, "P → R", "P"],
    [1, "P", "A"],
    [1, "Q", "impE", "1, 3"],
    [1, "R", "impE", "2, 3"],
    [1, "Q ∧ R", "andI", "4, 5"],
    [0, "P → (Q ∧ R)", "impI", "3-6"],
  ],
  "proof-by-cases": [
    [0, "P → R", "P"],
    [0, "Q → R", "P"],
    [1, "P ∨ Q", "A"],
    [2, "P", "A"],
    [2, "R", "impE", "1, 4"],
    [2, "Q", "A"],
    [2, "R", "impE", "2, 6"],
    [1, "R", "orE", "3, 4-5, 6-7"],
    [0, "(P ∨ Q) → R", "impI", "3-8"],
  ],
  "negated-conditional": [
    [0, "P ∧ ¬Q", "P"],
    [1, "P → Q", "A"],
    [1, "P", "andE", "1"],
    [1, "Q", "impE", "2, 3"],
    [1, "¬Q", "andE", "1"],
    [1, "⊥", "botI", "4, 5"],
    [0, "¬(P → Q)", "notI", "2-6"],
  ],
  "biconditional-swap": [
    [0, "P ↔ Q", "P"],
    [1, "Q", "A"],
    [1, "P", "iffE", "1, 2"],
    [1, "P", "A"],
    [1, "Q", "iffE", "1, 4"],
    [0, "Q ↔ P", "iffI", "2-3, 4-5"],
  ],
  absorption: [
    [0, "P → Q", "P"],
    [1, "P", "A"],
    [1, "Q", "impE", "1, 2"],
    [1, "P ∧ Q", "andI", "2, 3"],
    [0, "P → (P ∧ Q)", "impI", "2-4"],
  ],
  "universal-distribution": [
    [0, "∀x (P(x) ∧ Q(x))", "P"],
    [1, "[a]", "A"],
    [1, "P(a) ∧ Q(a)", "allE", "1"],
    [1, "P(a)", "andE", "3"],
    [0, "∀x P(x)", "allI", "2-4"],
    [1, "[b]", "A"],
    [1, "P(b) ∧ Q(b)", "allE", "1"],
    [1, "Q(b)", "andE", "7"],
    [0, "∀x Q(x)", "allI", "6-8"],
    [0, "∀x P(x) ∧ ∀x Q(x)", "andI", "5, 9"],
  ],
  "existential-weakening": [
    [0, "∃x P(x)", "P"],
    [1, "[a] P(a)", "A"],
    [1, "P(a) ∨ Q(a)", "orI", "2"],
    [1, "∃x (P(x) ∨ Q(x))", "exI", "3"],
    [0, "∃x (P(x) ∨ Q(x))", "exE", "1, 2-4"],
  ],
  "universal-to-existential": [
    [0, "∀x P(x)", "P"],
    [0, "P(a)", "allE", "1"],
    [0, "∃x P(x)", "exI", "2"],
  ],
  "universal-syllogism": [
    [0, "∀x (P(x) → Q(x))", "P"],
    [0, "∀x (Q(x) → R(x))", "P"],
    [1, "[a]", "A"],
    [2, "P(a)", "A"],
    [2, "P(a) → Q(a)", "allE", "1"],
    [2, "Q(a)", "impE", "5, 4"],
    [2, "Q(a) → R(a)", "allE", "2"],
    [2, "R(a)", "impE", "7, 6"],
    [1, "P(a) → R(a)", "impI", "4-8"],
    [0, "∀x (P(x) → R(x))", "allI", "3-9"],
  ],
  distinctness: [
    [0, "P(a)", "P"],
    [0, "¬P(b)", "P"],
    [1, "a = b", "A"],
    [1, "P(b)", "eqE", "1, 3"],
    [1, "⊥", "botI", "4, 2"],
    [0, "a ≠ b", "notI", "3-5"],
  ],
  "existential-split": [
    [0, "∃x (P(x) ∧ Q(x))", "P"],
    [1, "[a] P(a) ∧ Q(a)", "A"],
    [1, "P(a)", "andE", "2"],
    [1, "∃x P(x)", "exI", "3"],
    [1, "Q(a)", "andE", "2"],
    [1, "∃x Q(x)", "exI", "5"],
    [1, "∃x P(x) ∧ ∃x Q(x)", "andI", "4, 6"],
    [0, "∃x P(x) ∧ ∃x Q(x)", "exE", "1, 2-7"],
  ],
  "symmetric-relation": [
    [0, "∀x ∀y (R(x, y) → R(y, x))", "P"],
    [0, "R(a, b)", "P"],
    [0, "∀y (R(a, y) → R(y, a))", "allE", "1"],
    [0, "R(a, b) → R(b, a)", "allE", "3"],
    [0, "R(b, a)", "impE", "4, 2"],
  ],
  "peirces-law": [
    [1, "(P → Q) → P", "A"],
    [2, "¬P", "A"],
    [3, "P", "A"],
    [3, "⊥", "botI", "3, 2"],
    [3, "Q", "botE", "4"],
    [2, "P → Q", "impI", "3-5"],
    [2, "P", "impE", "1, 6"],
    [2, "⊥", "botI", "7, 2"],
    [1, "¬¬P", "notI", "2-8"],
    [1, "P", "notE", "9"],
    [0, "((P → Q) → P) → P", "impI", "1-10"],
  ],
  "converse-contraposition": [
    [0, "¬Q → ¬P", "P"],
    [1, "P", "A"],
    [2, "¬Q", "A"],
    [2, "¬P", "impE", "1, 3"],
    [2, "⊥", "botI", "2, 4"],
    [1, "¬¬Q", "notI", "3-5"],
    [1, "Q", "notE", "6"],
    [0, "P → Q", "impI", "2-7"],
  ],
  "material-implication": [
    [0, "P → Q", "P"],
    [1, "¬(¬P ∨ Q)", "A"],
    [2, "P", "A"],
    [2, "Q", "impE", "1, 3"],
    [2, "¬P ∨ Q", "orI", "4"],
    [2, "⊥", "botI", "5, 2"],
    [1, "¬P", "notI", "3-6"],
    [1, "¬P ∨ Q", "orI", "7"],
    [1, "⊥", "botI", "8, 2"],
    [0, "¬¬(¬P ∨ Q)", "notI", "2-9"],
    [0, "¬P ∨ Q", "notE", "10"],
  ],
  "negated-universal": [
    [0, "¬∀x P(x)", "P"],
    [1, "¬∃x ¬P(x)", "A"],
    [2, "[a]", "A"],
    [3, "¬P(a)", "A"],
    [3, "∃x ¬P(x)", "exI", "4"],
    [3, "⊥", "botI", "5, 2"],
    [2, "¬¬P(a)", "notI", "4-6"],
    [2, "P(a)", "notE", "7"],
    [1, "∀x P(x)", "allI", "3-8"],
    [1, "⊥", "botI", "9, 1"],
    [0, "¬¬∃x ¬P(x)", "notI", "2-10"],
    [0, "∃x ¬P(x)", "notE", "11"],
  ],
  "existential-antecedent": [
    [0, "∃x P(x) → Q", "P"],
    [1, "[a]", "A"],
    [2, "P(a)", "A"],
    [2, "∃x P(x)", "exI", "3"],
    [2, "Q", "impE", "1, 4"],
    [1, "P(a) → Q", "impI", "3-5"],
    [0, "∀x (P(x) → Q)", "allI", "2-6"],
  ],
  uniqueness: [
    [0, "∃x (P(x) ∧ ∀y (P(y) → y = x))", "P"],
    [0, "P(a)", "P"],
    [0, "P(b)", "P"],
    [1, "[c] P(c) ∧ ∀y (P(y) → y = c)", "A"],
    [1, "∀y (P(y) → y = c)", "andE", "4"],
    [1, "P(a) → a = c", "allE", "5"],
    [1, "a = c", "impE", "6, 2"],
    [1, "P(b) → b = c", "allE", "5"],
    [1, "b = c", "impE", "8, 3"],
    [1, "a = b", "eqE", "7, 9"],
    [0, "a = b", "exE", "1, 4-10"],
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
  it("has 50 problems, each with a model solution", () => {
    expect(PROBLEMS).toHaveLength(50);
    expect(PROBLEMS.map((p) => p.number)).toEqual(PROBLEMS.map((_, i) => i + 1));
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(50);
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
