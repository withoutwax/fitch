import { freeNames, replaceTerms, strictEqual, type Formula, type Term } from "./formula";

export type AdvancedRule = "truthTable" | "domainClosure" | "induction" | "rationalEquation" | "rationalInduction";

export interface AdvancedVocabulary {
  objects: readonly string[];
  functions: readonly string[];
}

export function advancedRuleAvailable(
  rule: AdvancedRule,
  []: readonly Formula[],
  { objects, functions }: AdvancedVocabulary,
): boolean {
  switch (rule) {
    case "domainClosure": return objects.length > 0 && functions.length === 0;
    case "induction": return objects.length > 0 && functions.length > 0;
    case "rationalInduction": return objects.length === 0 && functions.length === 0;
    default: return true;
  }
}

export function validateAdvancedRule(
  rule: AdvancedRule,
  target: Formula,
  supports: readonly Formula[],
  vocabulary: AdvancedVocabulary,
  context?: readonly Formula[],
): boolean {
  return advancedRuleSupportIndices(rule, target, supports, vocabulary, context) !== false;
}

/** The first matching support for each case, in vocabulary order. */
export function advancedRuleSupportIndices(
  rule: AdvancedRule,
  target: Formula,
  supports: readonly Formula[],
  vocabulary: AdvancedVocabulary,
  context: readonly Formula[] = supports,
): number[] | false {
  if (!advancedRuleAvailable(rule, supports, vocabulary) || !isClosed(target)) return false;
  if (rule === "truthTable") {
    return truthTableEntails(supports, target) ? supports.map((_, index) => index) : false;
  }
  if (rule === "rationalEquation") {
    return target.t === "eq" && rationalEqual(target.l, target.r) ? [] : false;
  }
  if (target.t !== "all" || !supports.length) return false;

  const objects = rule === "rationalInduction" ? ["0"] : vocabulary.objects;
  const bases = objects.map((object) => {
    const instance = replaceTerms(target.body, target.v, object);
    return supports.findIndex((support) => strictEqual(support, instance));
  });
  if (bases.includes(-1)) return false;
  if (rule === "domainClosure") return bases;

  const steps = rule === "rationalInduction"
    ? [unaryCase(target.v, target.body, { name: "+", args: [target.v, "1"] })]
    : vocabulary.functions.map((name) => constructorCase(target.v, target.body, name, context));
  const inductive = steps.map((step) => step ? supports.findIndex((support) => matchesInductiveCase(step, support)) : -1);
  return inductive.includes(-1) ? false : [...bases, ...inductive];
}

function isClosed(formula: Formula): boolean {
  return ![...freeNames(formula)].some((name) => /^[A-Z]/.test(name));
}

const MAX_TRUTH_ATOMS = 16;
const MAX_TRUTH_WORK = 2_000_000;
const truthTableLimit = Symbol();

function truthTableEntails(supports: readonly Formula[], conclusion: Formula): boolean {
  const atoms: Formula[] = [];
  let nodes = 0;
  type Eval = (row: number) => boolean;
  function compile(formula: Formula): Eval {
    if (++nodes * 2 ** atoms.length > MAX_TRUTH_WORK) throw truthTableLimit;
    switch (formula.t) {
      case "not": {
        const evaluate = compile(formula.a);
        return (row) => !evaluate(row);
      }
      case "and":
      case "or":
      case "imp":
      case "iff": {
        const left = compile(formula.a);
        const right = compile(formula.b);
        if (formula.t === "and") return (row) => left(row) && right(row);
        if (formula.t === "or") return (row) => left(row) || right(row);
        if (formula.t === "imp") return (row) => !left(row) || right(row);
        return (row) => left(row) === right(row);
      }
      default: {
        // Stanford treats quantified formulas, equalities and false as atoms here.
        let index = atoms.findIndex((atom) => strictEqual(atom, formula));
        if (index === -1) {
          if (atoms.length === MAX_TRUTH_ATOMS) throw truthTableLimit;
          index = atoms.push(formula) - 1;
        }
        return (row) => (row & (1 << index)) !== 0;
      }
    }
  }
  try {
    // The conjunction of zero premises is the Stanford atom "true".
    const premises: readonly Formula[] = supports.length ? supports : [{ t: "atom", pred: "true", args: [] }];
    const antecedents = premises.map(compile);
    const consequent = compile(conclusion);
    const rows = 2 ** atoms.length;
    if (rows * nodes > MAX_TRUTH_WORK) return false;
    for (let row = 0; row < rows; row++) {
      if (antecedents.every((antecedent) => antecedent(row)) && !consequent(row)) return false;
    }
    return true;
  } catch (error) {
    if (error === truthTableLimit) return false;
    throw error;
  }
}

const constructorOperators = new Map([["plus", "+"], ["times", "*"], ["cons", "!"]]);

function constructorArity(name: string, formulas: readonly Formula[]): number | undefined {
  const operator = constructorOperators.get(name);
  function inTerm(term: Term): number | undefined {
    if (typeof term === "string") return undefined;
    const constructor = term.name === operator || (term.name === name && term.notation === "call");
    if (constructor && term.args.length) return term.args.length;
    return inTerms(term.args);
  }
  function inTerms(terms: readonly Term[]): number | undefined {
    for (const term of terms) {
      const arity = inTerm(term);
      if (arity !== undefined) return arity;
    }
  }
  function inFormula(formula: Formula): number | undefined {
    switch (formula.t) {
      case "atom":
        return formula.pred === name && formula.args.length ? formula.args.length : inTerms(formula.args);
      case "eq": return inTerms([formula.l, formula.r]);
      case "bot": return undefined;
      case "not": return inFormula(formula.a);
      case "all":
      case "ex": return inFormula(formula.body);
      default: return inFormula(formula.a) ?? inFormula(formula.b);
    }
  }
  for (const formula of formulas) {
    const arity = inFormula(formula);
    if (arity !== undefined) return arity;
  }
}

function unaryCase(variable: string, body: Formula, successor: Term): Formula {
  return { t: "all", v: variable, body: { t: "imp", a: body, b: replaceTerms(body, variable, successor) } };
}

function matchesInductiveCase(expected: Formula, support: Formula): boolean {
  const variables = new Set<string>();
  while (expected.t === "all") {
    if (support.t !== "all" || variables.has(support.v) || freeNames(expected).has(support.v)) return false;
    variables.add(support.v);
    expected = replaceTerms(expected.body, expected.v, support.v);
    support = support.body;
  }
  return strictEqual(expected, support);
}

function constructorCase(variable: string, body: Formula, name: string, context: readonly Formula[]): Formula | undefined {
  const arity = constructorArity(name, context);
  const operator = constructorOperators.get(name);
  const constructor = (args: Term[]): Term => operator ? { name: operator, args } : { name, args, notation: "call" };

  if (arity === 1) return unaryCase(variable, body, constructor([variable]));
  if (arity !== 2) return undefined;

  const used = freeNames(body).add(variable);
  let serial = 0;
  const fresh = () => {
    let candidate: string;
    do candidate = `V${++serial}`; while (used.has(candidate));
    used.add(candidate);
    return candidate;
  };
  const first = fresh();
  const second = fresh();
  const a = replaceTerms(body, variable, first);
  const b = replaceTerms(body, variable, second);
  const result = replaceTerms(body, variable, constructor([first, second]));
  return {
    t: "all",
    v: first,
    body: {
      t: "all",
      v: second,
      body: { t: "imp", a: { t: "and", a, b }, b: result },
    },
  };
}

type Monomial = { factors: string[]; coefficient: bigint };
type Polynomial = Map<string, Monomial>;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const MAX_COEFFICIENT = BigInt(10) ** BigInt(4096);
const MAX_POLYNOMIAL_WORK = 16_384;
const arithmeticLimit = Symbol();

function termKey(term: Term): unknown {
  return typeof term === "string"
    ? term
    : [term.name, term.notation === "call", term.args.map(termKey)];
}

function addMonomial(polynomial: Polynomial, factors: string[], coefficient: bigint): void {
  if (coefficient === ZERO) return;
  if (factors.length > 128) throw arithmeticLimit;
  const key = JSON.stringify(factors);
  const total = (polynomial.get(key)?.coefficient ?? ZERO) + coefficient;
  if (total >= MAX_COEFFICIENT) throw arithmeticLimit;
  polynomial.set(key, { factors, coefficient: total });
}

function rationalEqual(left: Term, right: Term): boolean {
  let remaining = MAX_POLYNOMIAL_WORK;
  function spend() {
    if (--remaining < 0) throw arithmeticLimit;
  }
  function normalize(term: Term): Polynomial {
    spend();
    const result: Polynomial = new Map();
    if (typeof term === "string" && /^\d+$/.test(term)) {
      if (term.length > 4096) throw arithmeticLimit;
      addMonomial(result, [], BigInt(term));
    } else if (typeof term !== "string" && (term.name === "+" || term.name === "*") && term.args.length === 2) {
      const a = normalize(term.args[0]);
      const b = normalize(term.args[1]);
      if (term.name === "+") {
        for (const { factors, coefficient } of [...a.values(), ...b.values()]) {
          spend();
          addMonomial(result, factors, coefficient);
        }
      } else {
        for (const first of a.values()) {
          for (const second of b.values()) {
            spend();
            addMonomial(result, [...first.factors, ...second.factors].sort(), first.coefficient * second.coefficient);
          }
        }
      }
    } else {
      addMonomial(result, [JSON.stringify(termKey(term))], ONE);
    }
    return result;
  }
  try {
    const a = normalize(left);
    const b = normalize(right);
    return a.size === b.size && [...a].every(([key, term]) => term.coefficient === b.get(key)?.coefficient);
  } catch (error) {
    if (error === arithmeticLimit) return false;
    throw error;
  }
}
