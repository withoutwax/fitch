import { describe, expect, it } from "vitest";
import {
  equal,
  equalTerm,
  freeNames,
  instanceTerm,
  parseFormula,
  parseTerm,
  replacementVariants,
  replaceTerms,
  replacesSome,
  show,
  showStanford,
  showTerm,
  strictEqual,
  termNames,
} from "./formula";

describe("Stanford formula syntax", () => {
  it("reads named binders, lowercase predicates, and false", () => {
    const formula = parseFormula("APerson:EX:knows(Person,X) => false");
    expect(formula).toEqual({
      t: "imp",
      a: { t: "all", v: "Person", body: {
        t: "ex", v: "X", body: { t: "atom", pred: "knows", args: ["Person", "X"] },
      } },
      b: { t: "bot" },
    });
    expect(freeNames(formula)).toEqual(new Set());
  });

  it("groups Stanford ASCII connective chains to the right", () => {
    expect(showStanford(parseFormula("p & q & r <=> s <=> t"))).toBe("p & (q & r) <=> (s <=> t)");
    expect(strictEqual(parseFormula("p & q & r"), parseFormula("(p & q) & r"))).toBe(false);
  });

  it("keeps the grouping of saved Unicode formulas", () => {
    const formula = parseFormula("∀x P(x) ∧ Q(a) ∧ R(a)");
    expect(show(formula)).toBe("∀x P(x) ∧ Q(a) ∧ R(a)");
    expect(showStanford(formula)).toBe("(AX:P(X) & Q(a)) & R(a)");
    expect(strictEqual(formula, parseFormula(show(formula)))).toBe(true);
  });

  it("round-trips infix grouping and nested predicate terms", () => {
    const formula = parseFormula("AX:~(p(f[X],g(X)) | p([X,2])) => X=2");
    expect(strictEqual(parseFormula(showStanford(formula)), formula)).toBe(true);
    expect(strictEqual(parseFormula(show(formula)), formula)).toBe(true);
    expect(freeNames(formula)).toEqual(new Set(["2", "nil", "X"]));
  });

  it("keeps native mixed-case identifiers intact on export", () => {
    const formula = parseFormula("APerson:knowsPerson(Person,a)");
    expect(showStanford(formula)).toBe("APerson:knowsPerson(Person,a)");
  });

  it("preserves predicate application case in Stanford proofs", () => {
    const proof = [parseFormula("P(a)"), parseFormula("~p(a)")].map(showStanford);
    expect(proof).toEqual(["P(a)", "~p(a)"]);
  });

  it("protects improper lists in equations when read by Stanford", () => {
    expect(showStanford(parseFormula("(a!b)=(c!d)"))).toBe("(a!b)=(c!d)");
  });

  it("rejects trailing expressions and malformed delimiters", () => {
    expect(() => parseFormula("p(a) q(a)")).toThrow();
    expect(() => parseFormula("AX:p(f[X)")).toThrow();
    expect(() => parseTerm("1 +")).toThrow();
  });

  it("separates strict binder identity from alpha equivalence", () => {
    const x = parseFormula("AX:p(f[X])");
    const y = parseFormula("AY:p(f[Y])");
    expect(equal(x, y)).toBe(true);
    expect(strictEqual(x, y)).toBe(false);
  });
});

describe("compound terms", () => {
  it("reads numeric leaves and groups multiplication before addition", () => {
    const term = parseTerm("2+3*4");
    expect(term).toEqual({ name: "+", args: ["2", { name: "*", args: ["3", "4"] }] });
    expect(showTerm(term)).toBe("2+3*4");
  });

  it("preserves term grouping and function application notation", () => {
    const term = parseTerm("f[(2+3)*4,g(X)]");
    expect(showTerm(term)).toBe("f[(2+3)*4,g(X)]");
    expect(equalTerm(term, parseTerm(showTerm(term)))).toBe(true);
    expect(equalTerm(parseTerm("f[a]"), parseTerm("f(a)"))).toBe(false);
    expect(termNames(term)).toEqual(new Set(["2", "3", "4", "X"]));
  });

  it("normalizes Stanford prefix aliases in term positions", () => {
    expect(equalTerm(parseTerm("plus(2,times(3,4))"), parseTerm("2+3*4"))).toBe(true);
    expect(strictEqual(parseFormula("p(cons(a,nil))"), parseFormula("p([a])"))).toBe(true);
    expect(equalTerm(parseTerm("plus[2,3]"), parseTerm("2+3"))).toBe(false);
  });

  it("reads variable names that resemble legacy quantifier shortcuts in equations", () => {
    expect(parseFormula("AX:a=Ax")).toEqual({
      t: "all", v: "X", body: { t: "eq", l: "a", r: "Ax" },
    });
    expect(parseFormula("Ax=EX")).toEqual({ t: "eq", l: "Ax", r: "EX" });
  });

  it("reads proper lists as nested cons terms", () => {
    const term = parseTerm("[a,f[X]]");
    expect(equalTerm(term, parseTerm("a!f[X]!nil"))).toBe(true);
    expect(showTerm(term)).toBe("[a,f[X]]");
  });

  it("infers one compound instance across nested term positions", () => {
    const body = parseFormula("p(g[X],X)");
    expect(instanceTerm(body, "X", parseFormula("p(g[f[a]],f[a])"))).toEqual(parseTerm("f[a]"));
    expect(instanceTerm(body, "X", parseFormula("p(g[f[a]],f[b])"))).toBe(false);
    expect(instanceTerm(parseFormula("AY:p(X,Y)"), "X", parseFormula("AY:p(f[Y],Y)"))).toBe(false);
  });

  it("replaces free subterms without changing bound occurrences", () => {
    const before = parseFormula("p(g[f[a]],f[a]) & ∀a p(f[a])");
    const after = replaceTerms(before, parseTerm("f[a]"), "b");
    expect(show(after)).toBe("p(g[b], b) ∧ ∀a p(f[a])");
    expect(replacesSome(before, parseFormula("p(g[b],f[a]) & ∀a p(f[a])"), parseTerm("f[a]"), "b")).toBe(true);
  });

  it("renames a binder only where replacing a term would capture a name", () => {
    const before = parseFormula("AX:p(f[a],X) & AX:q(X)");
    const after = replaceTerms(before, parseTerm("f[a]"), "X");
    expect(after).toEqual(parseFormula("AX_1:p(X,X_1) & AX:q(X)"));
    expect(freeNames(after)).toEqual(new Set(["X"]));
  });
});

describe("substitution variants", () => {
  it("enumerates each nonempty subset in Stanford order", () => {
    const formula = parseFormula("p(a,f[a])");
    expect(replacementVariants(formula, "a", "X").map(showStanford)).toEqual([
      "p(a,f[X])",
      "p(X,f[a])",
      "p(X,f[X])",
    ]);
  });

  it("skips a quantifier that binds the replacement name", () => {
    const formula = parseFormula("AX:p(a,X) & p(a,a)");
    expect(replacementVariants(formula, "a", "X").map(showStanford)).toEqual([
      "AX:p(a,X) & p(a,X)",
      "AX:p(a,X) & p(X,a)",
      "AX:p(a,X) & p(X,X)",
    ]);
  });
});
