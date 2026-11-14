import { describe, expect, it } from "vitest";
import { checkProof } from "./checker";
import { type Formula, parseFormula } from "./formula";
import { PROBLEMS, type Problem } from "./problems";
import { build, SOLUTIONS } from "./solutions";

// Audits every problem: it parses, propositional ones are valid by truth
// table, the model solution checks, and no two problems are the same sequent
// up to renaming of letters.

function atoms(f: Formula, out: Set<string>): Set<string> {
  switch (f.t) {
    case "atom":
      if (f.args.length === 0) out.add(f.pred);
      return out;
    case "not":
      return atoms(f.a, out);
    case "and":
    case "or":
    case "imp":
    case "iff":
      atoms(f.a, out);
      return atoms(f.b, out);
    default:
      return out;
  }
}

function evaluate(f: Formula, v: Record<string, boolean>): boolean {
  switch (f.t) {
    case "atom":
      return v[f.pred];
    case "bot":
      return false;
    case "not":
      return !evaluate(f.a, v);
    case "and":
      return evaluate(f.a, v) && evaluate(f.b, v);
    case "or":
      return evaluate(f.a, v) || evaluate(f.b, v);
    case "imp":
      return !evaluate(f.a, v) || evaluate(f.b, v);
    case "iff":
      return evaluate(f.a, v) === evaluate(f.b, v);
    default:
      throw new Error(`not propositional: ${f.t}`);
  }
}

function truthTableValid(premises: Formula[], goal: Formula): boolean {
  const letters = [...[...premises, goal].reduce((s, f) => atoms(f, s), new Set<string>())];
  for (let mask = 0; mask < 1 << letters.length; mask++) {
    const v = Object.fromEntries(letters.map((l, i) => [l, Boolean(mask & (1 << i))]));
    if (premises.every((p) => evaluate(p, v)) && !evaluate(goal, v)) return false;
  }
  return true;
}

// Rename predicates and terms in order of first appearance.
function canonical(fs: Formula[]): string {
  const preds = new Map<string, string>();
  const terms = new Map<string, string>();
  const pr = (s: string) => preds.get(s) ?? (preds.set(s, `P${preds.size}`), preds.get(s)!);
  const tm = (s: string) => terms.get(s) ?? (terms.set(s, `t${terms.size}`), terms.get(s)!);
  const go = (f: Formula): string => {
    switch (f.t) {
      case "atom":
        return `${pr(f.pred)}(${f.args.map(tm).join(",")})`;
      case "eq":
        return `(${tm(f.l)}=${tm(f.r)})`;
      case "bot":
        return "⊥";
      case "not":
        return `¬${go(f.a)}`;
      case "all":
      case "ex":
        return `${f.t}${tm(f.v)}.${go(f.body)}`;
      default:
        return `(${go(f.a)} ${f.t} ${go(f.b)})`;
    }
  };
  return fs.map(go).join(" ; ");
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
}

function sequentKey(p: Problem): string {
  const prem = p.premises.map(parseFormula);
  const goal = parseFormula(p.goal);
  return permutations(prem)
    .map((ps) => `${canonical([...ps, goal])} | ${ps.length}`)
    .sort()[0];
}

describe("problem audit", () => {
  it("has unique ids and numbers 1..N in order", () => {
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
    expect(PROBLEMS.map((p) => p.number)).toEqual(PROBLEMS.map((_, i) => i + 1));
  });

  it("has no duplicate sequents up to renaming", () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const p of PROBLEMS) {
      const k = sequentKey(p);
      if (seen.has(k)) dups.push(`${seen.get(k)} = ${p.id}`);
      else seen.set(k, p.id);
    }
    expect(dups).toEqual([]);
  });

  it("detects renamed duplicates", () => {
    const a = { premises: ["P → Q", "¬Q"], goal: "¬P" } as Problem;
    const b = { premises: ["¬S", "R → S"], goal: "¬R" } as Problem;
    expect(sequentKey(a)).toBe(sequentKey(b));
  });

  for (const p of PROBLEMS) {
    describe(`#${p.number} ${p.id}`, () => {
      it("has a title, description and hint", () => {
        expect(p.title.trim()).not.toBe("");
        expect(p.description.trim()).not.toBe("");
        expect(p.hint.trim()).not.toBe("");
      });

      it("parses", () => {
        for (const s of [...p.premises, p.goal]) expect(() => parseFormula(s), s).not.toThrow();
      });

      if (p.category === "Propositional") {
        it("is valid by truth table", () => {
          expect(truthTableValid(p.premises.map(parseFormula), parseFormula(p.goal))).toBe(true);
        });
      }

      it("has a solution that checks", () => {
        const rows = SOLUTIONS[p.id];
        expect(rows).toBeDefined();
        const res = checkProof(build(rows), parseFormula(p.goal));
        expect(res.message).toBe("Proof complete!");
        expect(res.solved).toBe(true);
      });
    });
  }

  it("truth table rejects an invalid sequent", () => {
    expect(truthTableValid([parseFormula("P → Q"), parseFormula("Q")], parseFormula("P"))).toBe(false);
  });
});
