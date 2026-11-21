import { describe, expect, it } from "vitest";
import { advancedRuleAvailable, advancedRuleSupportIndices, validateAdvancedRule } from "./advancedRules";
import { parseFormula, type Formula, type Term } from "./formula";

const empty = { objects: [], functions: [] };
const atom = (pred: string, ...args: Term[]): Formula => ({ t: "atom", pred, args });
const property = (...args: Term[]): Formula => atom("p", ...args);
const all = (v: string, body: Formula): Formula => ({ t: "all", v, body });
const imp = (a: Formula, b: Formula): Formula => ({ t: "imp", a, b });
const and = (a: Formula, b: Formula): Formula => ({ t: "and", a, b });
const not = (a: Formula): Formula => ({ t: "not", a });
const eq = (l: Term, r: Term): Formula => ({ t: "eq", l, r });
const term = (name: string, ...args: Term[]): Term => ({ name, args });
const call = (name: string, ...args: Term[]): Term => ({ name, args, notation: "call" });

describe("Stanford advanced inference", () => {
  it("enables the induction rules for their respective vocabularies", () => {
    const finite = { objects: ["a"], functions: [] };
    const generated = { objects: ["a"], functions: ["f"] };
    expect(advancedRuleAvailable("truthTable", [], empty)).toBe(true);
    expect(advancedRuleAvailable("rationalEquation", [], generated)).toBe(true);
    expect(advancedRuleAvailable("domainClosure", [], finite)).toBe(true);
    expect(advancedRuleAvailable("domainClosure", [], generated)).toBe(false);
    expect(advancedRuleAvailable("induction", [], generated)).toBe(true);
    expect(advancedRuleAvailable("induction", [], { objects: [], functions: ["f"] })).toBe(false);
    expect(advancedRuleAvailable("rationalInduction", [], empty)).toBe(true);
    expect(advancedRuleAvailable("rationalInduction", [], finite)).toBe(false);
  });

  it("validates truth-table consequences and rejects countermodels", () => {
    const p = atom("p");
    const q = atom("q");
    expect(validateAdvancedRule("truthTable", imp(p, p), [], empty)).toBe(true);
    expect(validateAdvancedRule("truthTable", q, [imp(p, q), p], empty)).toBe(true);
    expect(validateAdvancedRule("truthTable", p, [imp(p, q), q], empty)).toBe(false);
    expect(validateAdvancedRule("truthTable", q, [p, not(p)], empty)).toBe(true);
  });

  it("treats quantified statements and false as opaque truth-table atoms", () => {
    const universal = all("X", property("X"));
    expect(validateAdvancedRule("truthTable", universal, [universal], empty)).toBe(true);
    expect(validateAdvancedRule("truthTable", property("a"), [universal], empty)).toBe(false);
    expect(validateAdvancedRule("truthTable", atom("p"), [{ t: "bot" }], empty)).toBe(false);
    expect(validateAdvancedRule("truthTable", property("X"), [property("X")], empty)).toBe(false);
  });

  it("bounds the size of a truth table", () => {
    const conjunction = Array.from({ length: 30 }, (_, index) => atom(`p${index}`)).reduce(and);
    expect(validateAdvancedRule("truthTable", imp(conjunction, conjunction), [], empty)).toBe(false);
  });

  it("requires and cites an instance for every declared object", () => {
    const vocabulary = { objects: ["a", "b"], functions: [] };
    const target = all("X", property("X"));
    expect(advancedRuleSupportIndices("domainClosure", target, [property("b"), atom("q"), property("a")], vocabulary)).toEqual([2, 0]);
    expect(validateAdvancedRule("domainClosure", target, [property("a")], vocabulary)).toBe(false);
    expect(validateAdvancedRule("domainClosure", property("a"), [property("a"), property("b")], vocabulary)).toBe(false);
  });

  it("checks unary and binary structural induction with renamed outer binders", () => {
    const vocabulary = { objects: ["a"], functions: ["f", "g"] };
    const target = all("X", property("X"));
    const f = all("Y", imp(property("Y"), property(call("f", "Y"))));
    const g = all("U", all("V", imp(and(property("U"), property("V")), property(call("g", "U", "V")))));
    expect(advancedRuleSupportIndices("induction", target, [g, property("a"), f], vocabulary)).toEqual([1, 2, 0]);
    expect(validateAdvancedRule("induction", target, [f, g], vocabulary)).toBe(false);
    expect(validateAdvancedRule("induction", target, [property("a"), f], vocabulary)).toBe(false);
  });

  it("uses the constructor arity already established in the proof", () => {
    const vocabulary = { objects: ["a"], functions: ["f"] };
    const target = all("X", property("X"));
    const base = property("a");
    const unary = all("Y", imp(property("Y"), property(call("f", "Y"))));
    const ternaryUse = property(call("f", "a", "b", "c"));
    expect(validateAdvancedRule("induction", target, [base, unary], vocabulary, [ternaryUse, base, unary])).toBe(false);
    expect(validateAdvancedRule("induction", target, [base, all("Y", imp(property("Y"), property(term("f", "Y"))))], vocabulary)).toBe(false);
  });

  it("keeps binders inside the inductive property fixed", () => {
    const vocabulary = { objects: ["a"], functions: ["f"] };
    const target = parseFormula("AX:EZ:p(X,Z)");
    const base = parseFormula("EZ:p(a,Z)");
    const renamedOuter = parseFormula("AY:((EZ:p(Y,Z)) => (EZ:p(f(Y),Z)))");
    const renamedInner = parseFormula("AY:((EW:p(Y,W)) => (EW:p(f(Y),W)))");
    expect(validateAdvancedRule("induction", target, [base, renamedOuter], vocabulary)).toBe(true);
    expect(validateAdvancedRule("induction", target, [base, renamedInner], vocabulary)).toBe(false);
  });

  it("normalizes ground arithmetic using distributivity and exact coefficients", () => {
    const sum = term("+", "a", "1");
    expect(validateAdvancedRule("rationalEquation", eq(term("*", "2", sum), term("+", term("*", "2", "a"), "2")), [], empty)).toBe(true);
    expect(validateAdvancedRule("rationalEquation", eq(term("+", "9007199254740992", "1"), "9007199254740993"), [], empty)).toBe(true);
    expect(validateAdvancedRule("rationalEquation", eq(term("+", "9007199254740992", "1"), "9007199254740992"), [], empty)).toBe(false);
    expect(validateAdvancedRule("rationalEquation", eq(term("+", "X", "0"), "X"), [], empty)).toBe(false);
  });

  it("accepts Stanford's named arithmetic operators inside an equation", () => {
    const formula = parseFormula("times(2,plus(a,1)) = 2*a+2");
    expect(validateAdvancedRule("rationalEquation", formula, [], empty)).toBe(true);
  });

  it("keeps arithmetic inside opaque function terms unchanged", () => {
    const left = term("f", term("+", "1", "1"));
    expect(validateAdvancedRule("rationalEquation", eq(left, term("f", "2")), [], empty)).toBe(false);
    expect(validateAdvancedRule("rationalEquation", eq(term("+", left, left), term("*", "2", left)), [], empty)).toBe(true);
  });

  it("requires the zero case and a universally quantified successor implication", () => {
    const target = all("X", property("X"));
    const base = property("0");
    const step = all("Y", imp(property("Y"), property(term("+", "Y", "1"))));
    expect(advancedRuleSupportIndices("rationalInduction", target, [step, base], empty)).toEqual([1, 0]);
    expect(validateAdvancedRule("rationalInduction", target, [step, property("1")], empty)).toBe(false);
    expect(validateAdvancedRule("rationalInduction", target, [base, all("Y", imp(property("Y"), property(term("+", "Y", "2"))))], empty)).toBe(false);
  });
});
