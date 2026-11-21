// Bare term names stay strings. Stanford uses brackets for functions and also
// accepts parenthesized applications as terms with a distinct representation.
export type Term = string | { name: string; args: Term[]; notation?: "call" };

export type Formula =
  | { t: "atom"; pred: string; args: Term[]; called?: true }
  | { t: "eq"; l: Term; r: Term }
  | { t: "bot" }
  | { t: "not"; a: Formula }
  | { t: "and" | "or" | "imp" | "iff"; a: Formula; b: Formula }
  | { t: "all" | "ex"; v: string; body: Formula };

export type Binary = Extract<Formula, { t: "and" | "or" | "imp" | "iff" }>;

export class ParseError extends Error {}

type Expr = Formula | Term;
type SymbolKind =
  | "lp" | "rp" | "lb" | "rb" | "comma" | "colon" | "end"
  | "all" | "ex" | "not" | "bang" | "and" | "or" | "imp" | "iff"
  | "bot" | "eq" | "neq" | "plus" | "times";
type Token = { k: SymbolKind } | { k: "name"; name: string };

const SYMBOLS: [string, SymbolKind][] = [
  ["<->", "iff"],
  ["<=>", "iff"],
  ["_|_", "bot"],
  ["->", "imp"],
  ["=>", "imp"],
  ["/\\", "and"],
  ["\\/", "or"],
  ["!=", "neq"],
  ["↔", "iff"],
  ["≡", "iff"],
  ["→", "imp"],
  ["⊃", "imp"],
  ["∧", "and"],
  ["&", "and"],
  ["^", "and"],
  ["∨", "or"],
  ["|", "or"],
  ["¬", "not"],
  ["~", "not"],
  ["!", "bang"],
  ["⊥", "bot"],
  ["#", "bot"],
  ["∀", "all"],
  ["∃", "ex"],
  ["≠", "neq"],
  ["=", "eq"],
  ["+", "plus"],
  ["*", "times"],
  ["(", "lp"],
  [")", "rp"],
  ["[", "lb"],
  ["]", "rb"],
  [",", "comma"],
  [":", "colon"],
];

const INFIX = {
  iff: 1, imp: 2, or: 3, and: 4, eq: 6, neq: 6, bang: 7, plus: 8, times: 9,
} as const satisfies Partial<Record<SymbolKind, number>>;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const name = /[A-Za-z0-9_][A-Za-z0-9_']*/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    const symbol = SYMBOLS.find(([s]) => src.startsWith(s, i));
    if (symbol) {
      const [spelling, k] = symbol;
      tokens.push({ k });
      i += spelling.length;
      continue;
    }
    name.lastIndex = i;
    const match = name.exec(src);
    if (!match) throw new ParseError(`Unexpected character “${src[i]}”`);
    tokens.push({ k: "name", name: match[0] });
    i = name.lastIndex;
  }
  return [...tokens, { k: "end" }];
}

function asFormula(expr: Expr): Formula {
  if (typeof expr === "string") {
    return expr === "false" ? { t: "bot" } : { t: "atom", pred: expr, args: [] };
  }
  if ("t" in expr) return expr;
  if (expr.notation !== "call") throw new ParseError("Expected a formula");
  const { name, args } = expr;
  return args.length ? { t: "atom", pred: name, args } : { t: "atom", pred: name, args, called: true };
}

const TERM_ALIASES = new Map([["plus", "+"], ["times", "*"], ["cons", "!"]]);
const FORMULA_START = new Set<Token["k"]>(["name", "lp", "all", "ex", "not", "bot"]);

function asTerm(expr: Expr): Term {
  if (typeof expr === "string") return expr;
  if ("t" in expr) throw new ParseError("Expected a term");
  if (expr.notation === "call" && expr.args.length === 2) {
    const name = TERM_ALIASES.get(expr.name);
    if (name) return { name, args: expr.args };
  }
  return expr;
}

function parse(src: string, termOnly: boolean): Expr {
  const tokens = tokenize(src);
  // Saved Unicode formulas use left association for conjunction, disjunction,
  // and biconditional. Stanford keyboard formulas use right association.
  const legacy = /[↔≡→⊃∧∨¬⊥∀∃≠^]|<->|->|\/\\|\\\//.test(src);
  const prefixPrecedence = INFIX.and + 1;
  const termPrecedence = INFIX.eq + 1;
  let cursor = 0;

  const peek = () => tokens[cursor];
  const next = () => tokens[cursor++];
  const expect = (k: SymbolKind, spelling: string) => {
    if (next().k !== k) throw new ParseError(`Expected “${spelling}”`);
  };

  function readArguments(close: "rp" | "rb"): Term[] {
    const args: Term[] = [];
    if (peek().k !== close) {
      args.push(asTerm(expression(termPrecedence)));
      while (peek().k === "comma") {
        next();
        args.push(asTerm(expression(termPrecedence)));
      }
    }
    expect(close, close === "rp" ? ")" : "]");
    return args;
  }

  function prefix(minimum: number): Expr {
    const token = next();
    switch (token.k) {
      case "name": {
        const name = token.name;
        if (minimum < termPrecedence && /^[AE][A-Z][A-Za-z0-9_']*$/.test(name) && peek().k === "colon") {
          next();
          return { t: name[0] === "A" ? "all" : "ex", v: name.slice(1), body: asFormula(expression(prefixPrecedence)) };
        }
        if (minimum < termPrecedence && /^[AE][u-z]$/.test(name) && FORMULA_START.has(peek().k)) {
          return { t: name[0] === "A" ? "all" : "ex", v: name[1], body: asFormula(expression(prefixPrecedence)) };
        }
        if (peek().k === "lp") {
          next();
          return { name, args: readArguments("rp"), notation: "call" };
        }
        if (peek().k === "lb") {
          next();
          return { name, args: readArguments("rb") };
        }
        return name;
      }
      case "lp": {
        const inner = expression(minimum >= termPrecedence ? termPrecedence : 1);
        expect("rp", ")");
        return inner;
      }
      case "lb":
        return readArguments("rb").reduceRight<Term>((tail, head) => ({ name: "!", args: [head, tail] }), "nil");
      case "bot":
        return { t: "bot" };
      case "all":
      case "ex": {
        const variable = next();
        if (variable.k !== "name" || !/^[A-Za-z]/.test(variable.name)) {
          throw new ParseError(`Expected a variable after ${token.k === "all" ? "∀" : "∃"}`);
        }
        return { t: token.k, v: variable.name, body: asFormula(expression(prefixPrecedence)) };
      }
      case "not":
      case "bang":
        return { t: "not", a: asFormula(expression(prefixPrecedence)) };
      case "end":
        throw new ParseError("Expression ends too early");
      default:
        throw new ParseError("Unexpected symbol");
    }
  }

  function expression(minimum: number): Expr {
    let left = prefix(minimum);
    while (true) {
      const op = peek().k;
      if (!Object.hasOwn(INFIX, op)) break;
      const infix = op as keyof typeof INFIX;
      const precedence = INFIX[infix];
      if (precedence < minimum) break;
      next();

      const leftAssociative = legacy && (infix === "and" || infix === "or" || infix === "iff");
      const right = expression(precedence + Number(leftAssociative));
      switch (infix) {
        case "plus":
        case "times":
        case "bang":
          left = {
            name: infix === "plus" ? "+" : infix === "times" ? "*" : "!",
            args: [asTerm(left), asTerm(right)],
          };
          break;
        case "eq":
        case "neq": {
          const eq: Formula = { t: "eq", l: asTerm(left), r: asTerm(right) };
          left = infix === "eq" ? eq : { t: "not", a: eq };
          break;
        }
        default:
          left = { t: infix, a: asFormula(left), b: asFormula(right) };
      }
    }
    return left;
  }

  if (peek().k === "end") throw new ParseError(termOnly ? "Empty term" : "Empty formula");
  const result = expression(termOnly ? termPrecedence : 1);
  if (peek().k !== "end") throw new ParseError("Unexpected symbols after the end of the expression");
  return result;
}

export function parseFormula(src: string): Formula {
  return asFormula(parse(src, false));
}

export function parseTerm(src: string): Term {
  return asTerm(parse(src, true));
}

// ---------- printing ----------

const SYM = { and: "∧", or: "∨", imp: "→", iff: "↔" } as const;
const ASCII = { and: "&", or: "|", imp: "=>", iff: "<=>" } as const;
const TERM_PRECEDENCE: Record<string, number> = { "!": INFIX.bang, "+": INFIX.plus, "*": INFIX.times };

function printTerm(term: Term, names: ReadonlyMap<string, string>, min = 0): string {
  if (typeof term === "string") return names.get(term) ?? term;

  if (term.name === "!" && term.args.length === 2) {
    const elements: string[] = [];
    let tail: Term = term;
    while (typeof tail !== "string" && tail.name === "!" && tail.args.length === 2) {
      elements.push(printTerm(tail.args[0], names));
      tail = tail.args[1];
    }
    if (tail === "nil" && !names.has(tail)) return `[${elements.join(",")}]`;
  }

  const priority = TERM_PRECEDENCE[term.name];
  if (priority && term.args.length === 2) {
    const left = printTerm(term.args[0], names, priority + 1);
    const right = printTerm(term.args[1], names, term.name === "*" ? priority : priority + 1);
    const text = `${left}${term.name}${right}`;
    return priority < min ? `(${text})` : text;
  }

  const args = term.args.map((arg) => printTerm(arg, names)).join(",");
  return term.notation === "call" ? `${term.name}(${args})` : `${term.name}[${args}]`;
}

export function showTerm(term: Term): string {
  return printTerm(term, new Map());
}

export function show(f: Formula): string {
  switch (f.t) {
    case "atom":
      return f.args.length || f.called ? `${f.pred}(${f.args.map(showTerm).join(", ")})` : f.pred;
    case "eq":
      return `${showTerm(f.l)} = ${showTerm(f.r)}`;
    case "bot":
      return "⊥";
    case "not":
      if (f.a.t === "eq") return `${showTerm(f.a.l)} ≠ ${showTerm(f.a.r)}`;
      return `¬${wrapUnary(f.a)}`;
    case "all":
    case "ex":
      return `${f.t === "all" ? "∀" : "∃"}${f.v} ${wrapUnary(f.body)}`;
    default: {
      const left = f.a.t === f.t && f.t !== "imp" ? show(f.a) : wrapUnary(f.a);
      const right = f.b.t === f.t && f.t === "imp" ? show(f.b) : wrapUnary(f.b);
      return `${left} ${SYM[f.t]} ${right}`;
    }
  }
}

function wrapUnary(f: Formula): string {
  return isBinary(f) || f.t === "eq" ? `(${show(f)})` : show(f);
}

export function showStanford(f: Formula): string {
  function print(formula: Formula, names: Map<string, string>, min = 0): string {
    switch (formula.t) {
      case "atom": {
        const args = formula.args.map((term) => printTerm(term, names)).join(",");
        // A bare uppercase name is a variable in Stanford syntax.
        return args || formula.called || /^[A-Z]/.test(formula.pred) ? `${formula.pred}(${args})` : formula.pred;
      }
      case "eq":
        return `${printTerm(formula.l, names, INFIX.bang + 1)}=${printTerm(formula.r, names, INFIX.bang + 1)}`;
      case "bot":
        return "false";
      case "not":
        return `~${print(formula.a, names, INFIX.and + 1)}`;
      case "all":
      case "ex": {
        const free = freeNames(formula.body, new Set([formula.v]));
        const occupied = new Set([...free].map((name) => names.get(name) ?? name));
        const base = formula.v.replace(/^[a-z]/, (initial) => initial.toUpperCase());
        const variable = freshName(base, occupied);
        const body = print(formula.body, new Map(names).set(formula.v, variable), INFIX.and + 1);
        return `${formula.t === "all" ? "A" : "E"}${variable}:${body}`;
      }
      default: {
        const precedence = INFIX[formula.t];
        const left = print(formula.a, names, precedence + 1);
        const right = print(formula.b, names, precedence + 1);
        const text = `${left} ${ASCII[formula.t]} ${right}`;
        return precedence < min ? `(${text})` : text;
      }
    }
  }

  return print(f, new Map());
}

export function isBinary(f: Formula): f is Binary {
  return f.t === "and" || f.t === "or" || f.t === "imp" || f.t === "iff";
}

/** Replace ASCII shorthands with logic symbols, for display in inputs. */
export function prettify(src: string): string {
  return src
    .replace(/<->|<=>/g, "↔")
    .replace(/->|=>/g, "→")
    .replace(/_\|_/g, "⊥")
    .replace(/\/\\/g, "∧")
    .replace(/\\\//g, "∨")
    .replace(/!=/g, "≠")
    .replace(/&/g, "∧")
    .replace(/\|/g, "∨")
    .replace(/~/g, "¬")
    .replace(/(^|[(,∧∨→↔¬]\s*)!/g, "$1¬")
    .replace(/#/g, "⊥")
    .replace(/\bA([u-z])\b/g, "∀$1")
    .replace(/\bE([u-z])\b/g, "∃$1");
}

// ---------- comparison and substitution ----------

type Env = ReadonlyMap<string, number>;
type Match = (s: Term, t: Term, ea: Env, eb: Env) => boolean | undefined;

function compareTerm(s: Term, t: Term, ea: Env, eb: Env, match?: Match): boolean {
  const override = match?.(s, t, ea, eb);
  if (override !== undefined) return override;
  if (typeof s === "string" && typeof t === "string") {
    const x = ea.get(s);
    const y = eb.get(t);
    return x !== undefined || y !== undefined ? x === y : s === t;
  }
  if (typeof s === "string" || typeof t === "string") return false;
  return s.name === t.name && s.notation === t.notation && s.args.length === t.args.length &&
    s.args.every((arg, i) => compareTerm(arg, t.args[i], ea, eb, match));
}

export function equalTerm(s: Term, t: Term): boolean {
  return compareTerm(s, t, new Map(), new Map());
}

export function termNames(term: Term, out: Set<string> = new Set()): Set<string> {
  if (typeof term === "string") out.add(term);
  else term.args.forEach((arg) => termNames(arg, out));
  return out;
}

/** Walk two formulas in lockstep, with their respective binding environments. */
function walk(
  a: Formula,
  b: Formula,
  strict: boolean,
  match?: Match,
  ea: Env = new Map(),
  eb: Env = new Map(),
  level = 0,
): boolean {
  if (a.t !== b.t) return false;
  const termsMatch = (s: Term, t: Term) => compareTerm(s, t, ea, eb, match);
  switch (a.t) {
    case "bot":
      return true;
    case "atom": {
      const bb = b as typeof a;
      return a.pred === bb.pred && a.called === bb.called && a.args.length === bb.args.length &&
        a.args.every((s, i) => termsMatch(s, bb.args[i]));
    }
    case "eq": {
      const bb = b as typeof a;
      return termsMatch(a.l, bb.l) && termsMatch(a.r, bb.r);
    }
    case "not":
      return walk(a.a, (b as typeof a).a, strict, match, ea, eb, level);
    case "all":
    case "ex": {
      const bb = b as typeof a;
      if (strict && a.v !== bb.v) return false;
      const ea2 = new Map(ea).set(a.v, level);
      const eb2 = new Map(eb).set(bb.v, level);
      return walk(a.body, bb.body, strict, match, ea2, eb2, level + 1);
    }
    default: {
      const bb = b as Binary;
      return walk(a.a, bb.a, strict, match, ea, eb, level) && walk(a.b, bb.b, strict, match, ea, eb, level);
    }
  }
}

/** Syntactic identity up to renaming of bound variables. */
export function equal(a: Formula, b: Formula): boolean {
  return walk(a, b, false);
}

/** Syntactic identity including the names of bound variables. */
export function strictEqual(a: Formula, b: Formula): boolean {
  return walk(a, b, true);
}

/** Infer the single term substituted for free occurrences of v in body. */
export function instanceTerm(body: Formula, v: string, target: Formula, strict = false): Term | null | false {
  let found: Term | null = null;
  const ok = walk(body, target, strict, (s, t, ea, eb) => {
    if (s !== v || ea.has(s)) return undefined;
    if ([...termNames(t)].some((name) => eb.has(name))) return false;
    if (found === null) found = t;
    return equalTerm(found, t);
  });
  return ok ? found : false;
}

/** Determine whether any subset of free occurrences of x can be replaced by y. */
export function replacesSome(from: Formula, to: Formula, x: Term, y: Term, strict = false): boolean {
  const sourceNames = termNames(x);
  const targetNames = termNames(y);
  return walk(from, to, strict, (s, t, ea, eb) => {
    if (equalTerm(s, x) && equalTerm(t, y) &&
      ![...sourceNames].some((name) => ea.has(name)) &&
      ![...targetNames].some((name) => eb.has(name))) return true;
    return undefined;
  });
}

/** Names occurring free in a formula (its constants, in a closed formula). */
export function freeNames(f: Formula, bound: ReadonlySet<string> = new Set(), out: Set<string> = new Set()): Set<string> {
  const add = (term: Term) => {
    if (typeof term === "string") {
      if (!bound.has(term)) out.add(term);
    } else term.args.forEach(add);
  };
  switch (f.t) {
    case "atom":
      f.args.forEach(add);
      break;
    case "eq":
      add(f.l);
      add(f.r);
      break;
    case "bot":
      break;
    case "not":
      freeNames(f.a, bound, out);
      break;
    case "all":
    case "ex":
      freeNames(f.body, new Set(bound).add(f.v), out);
      break;
    default:
      freeNames(f.a, bound, out);
      freeNames(f.b, bound, out);
  }
  return out;
}

function freshName(name: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(name)) return name;
  let index = 1;
  while (occupied.has(`${name}_${index}`)) index++;
  return `${name}_${index}`;
}

function collectBinderNames(f: Formula, names: Set<string>): void {
  if (f.t === "all" || f.t === "ex") {
    names.add(f.v);
    collectBinderNames(f.body, names);
  } else if (f.t === "not") {
    collectBinderNames(f.a, names);
  } else if (isBinary(f)) {
    collectBinderNames(f.a, names);
    collectBinderNames(f.b, names);
  }
}

/** Replace every free occurrence of a term, renaming binders to avoid capture. */
export function replaceTerms(formula: Formula, from: Term, to: Term): Formula {
  if (equalTerm(from, to)) return formula;
  const sourceNames = termNames(from);
  const targetNames = termNames(to);
  const occupied = new Set([...freeNames(formula), ...sourceNames, ...targetNames]);
  collectBinderNames(formula, occupied);

  const contains = (term: Term): boolean =>
    equalTerm(term, from) || (typeof term !== "string" && term.args.some(contains));

  function rewrite(f: Formula, renames: ReadonlyMap<string, string>, canReplace = true): Formula {
    if (!canReplace && renames.size === 0) return f;
    function term(t: Term): Term {
      if (canReplace && equalTerm(t, from)) return to;
      if (typeof t === "string") return renames.get(t) ?? t;
      return { ...t, args: t.args.map(term) };
    }
    switch (f.t) {
      case "atom":
        return { ...f, args: f.args.map(term) };
      case "eq":
        return { ...f, l: term(f.l), r: term(f.r) };
      case "bot":
        return f;
      case "not":
        return { ...f, a: rewrite(f.a, renames, canReplace) };
      case "all":
      case "ex": {
        const replaceInside = canReplace && !sourceNames.has(f.v);
        const insideRenames = new Map(renames);
        insideRenames.delete(f.v);
        if (replaceInside && targetNames.has(f.v) && containsFree(f.body)) {
          const name = freshName(f.v, occupied);
          occupied.add(name);
          insideRenames.set(f.v, name);
          return { ...f, v: name, body: rewrite(f.body, insideRenames) };
        }
        return { ...f, body: rewrite(f.body, insideRenames, replaceInside) };
      }
      default:
        return { ...f, a: rewrite(f.a, renames, canReplace), b: rewrite(f.b, renames, canReplace) };
    }
  }

  function containsFree(f: Formula): boolean {
    switch (f.t) {
      case "all":
      case "ex":
        return !sourceNames.has(f.v) && containsFree(f.body);
      case "not":
        return containsFree(f.a);
      case "atom":
        return f.args.some(contains);
      case "eq":
        return contains(f.l) || contains(f.r);
      case "bot":
        return false;
      default:
        return containsFree(f.a) || containsFree(f.b);
    }
  }

  return rewrite(formula, new Map());
}

function combinations<T>(choices: T[][]): T[][] {
  return choices.reduce<T[][]>(
    (prefixes, options) => prefixes.flatMap((prefix) => options.map((option) => [...prefix, option])),
    [[]],
  );
}

/** Enumerate the distinct, changed results of replacing a subset of free occurrences. */
export function replacementVariants(formula: Formula, from: Term, to: Term): Formula[] {
  if (equalTerm(from, to)) return [];
  const names = new Set([...termNames(from), ...termNames(to)]);

  function termVariants(term: Term): Term[] {
    if (equalTerm(term, from)) return [term, to];
    if (typeof term === "string") return [term];
    return combinations(term.args.map(termVariants)).map((args) => ({ ...term, args }));
  }

  function variants(f: Formula): Formula[] {
    switch (f.t) {
      case "atom":
        return combinations(f.args.map(termVariants)).map((args) => ({ ...f, args }));
      case "eq":
        return termVariants(f.l).flatMap((l) => termVariants(f.r).map((r) => ({ ...f, l, r })));
      case "bot":
        return [f];
      case "not":
        return variants(f.a).map((a) => ({ ...f, a }));
      case "all":
      case "ex":
        return names.has(f.v) ? [f] : variants(f.body).map((body) => ({ ...f, body }));
      default:
        return variants(f.a).flatMap((a) => variants(f.b).map((b) => ({ ...f, a, b })));
    }
  }

  return variants(formula).slice(1);
}

/** Flatten nested applications of an associative connective. */
export function flatten(f: Formula, op: "and" | "or"): Formula[] {
  return f.t === op ? [...flatten(f.a, op), ...flatten(f.b, op)] : [f];
}
