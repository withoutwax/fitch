// Formula syntax for first-order logic with identity (no function symbols).
// Terms are bare lowercase names; whether a name is a variable or a constant
// is decided by quantifier scope, not by spelling.

export type Formula =
  | { t: "atom"; pred: string; args: string[] }
  | { t: "eq"; l: string; r: string }
  | { t: "bot" }
  | { t: "not"; a: Formula }
  | { t: "and" | "or" | "imp" | "iff"; a: Formula; b: Formula }
  | { t: "all" | "ex"; v: string; body: Formula };

export type Binary = Extract<Formula, { t: "and" | "or" | "imp" | "iff" }>;

export class ParseError extends Error {}

type Tok =
  | { k: "lp" | "rp" | "comma" | "not" | "and" | "or" | "imp" | "iff" | "bot" | "eq" | "neq" | "end"; pos: number }
  | { k: "all" | "ex"; pos: number; v?: string }
  | { k: "upper" | "lower"; pos: number; s: string };

const SYMBOLS: [string, Tok["k"]][] = [
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
  ["!", "not"],
  ["⊥", "bot"],
  ["#", "bot"],
  ["∀", "all"],
  ["∃", "ex"],
  ["≠", "neq"],
  ["=", "eq"],
  ["(", "lp"],
  [")", "rp"],
  [",", "comma"],
];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  outer: while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    for (const [sym, k] of SYMBOLS) {
      if (src.startsWith(sym, i)) {
        toks.push({ k, pos: i } as Tok);
        i += sym.length;
        continue outer;
      }
    }
    const m = /^[A-Za-z][A-Za-z0-9_']*/.exec(src.slice(i));
    if (!m) throw new ParseError(`Unexpected character “${c}”`);
    const s = m[0];
    // ASCII quantifiers: "Ax" and "Ex" (variable letters u–z) mean ∀x and ∃x.
    if (/^[AE][u-z]$/.test(s)) {
      toks.push({ k: s[0] === "A" ? "all" : "ex", pos: i, v: s[1] });
    } else if (/^[A-Z]/.test(s)) {
      toks.push({ k: "upper", pos: i, s });
    } else {
      toks.push({ k: "lower", pos: i, s });
    }
    i += s.length;
  }
  toks.push({ k: "end", pos: src.length });
  return toks;
}

export function parseFormula(src: string): Formula {
  if (!src.trim()) throw new ParseError("Empty formula");
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (k: Tok["k"], what: string) => {
    const t = next();
    if (t.k !== k) throw new ParseError(`Expected ${what}`);
    return t;
  };

  const parseIff = (): Formula => {
    let f = parseImp();
    while (peek().k === "iff") {
      next();
      f = { t: "iff", a: f, b: parseImp() };
    }
    return f;
  };
  const parseImp = (): Formula => {
    const f = parseOr();
    if (peek().k === "imp") {
      next();
      return { t: "imp", a: f, b: parseImp() };
    }
    return f;
  };
  const parseOr = (): Formula => {
    let f = parseAnd();
    while (peek().k === "or") {
      next();
      f = { t: "or", a: f, b: parseAnd() };
    }
    return f;
  };
  const parseAnd = (): Formula => {
    let f = parseUnary();
    while (peek().k === "and") {
      next();
      f = { t: "and", a: f, b: parseUnary() };
    }
    return f;
  };
  const parseUnary = (): Formula => {
    const t = peek();
    if (t.k === "not") {
      next();
      return { t: "not", a: parseUnary() };
    }
    if (t.k === "all" || t.k === "ex") {
      next();
      let v = t.v;
      if (!v) {
        const vt = next();
        if (vt.k !== "lower") throw new ParseError(`Expected a variable after ${t.k === "all" ? "∀" : "∃"}`);
        v = vt.s;
      }
      return { t: t.k, v, body: parseUnary() };
    }
    return parsePrimary();
  };
  const parsePrimary = (): Formula => {
    const t = next();
    switch (t.k) {
      case "lp": {
        const f = parseIff();
        expect("rp", "“)”");
        return f;
      }
      case "bot":
        return { t: "bot" };
      case "upper": {
        const args: string[] = [];
        if (peek().k === "lp") {
          next();
          do {
            const a = next();
            if (a.k !== "lower") throw new ParseError(`Arguments of ${t.s} must be lowercase names`);
            args.push(a.s);
          } while (peek().k === "comma" && next());
          expect("rp", `“)” to close ${t.s}(…)`);
        }
        return { t: "atom", pred: t.s, args };
      }
      case "lower": {
        const op = next();
        if (op.k !== "eq" && op.k !== "neq") throw new ParseError(`Expected “=” after ${t.s}`);
        const r = next();
        if (r.k !== "lower") throw new ParseError("Expected a name on the right of “=”");
        const f: Formula = { t: "eq", l: t.s, r: r.s };
        return op.k === "neq" ? { t: "not", a: f } : f;
      }
      case "end":
        throw new ParseError("Formula ends too early");
      default:
        throw new ParseError("Unexpected symbol");
    }
  };

  const f = parseIff();
  if (peek().k !== "end") throw new ParseError("Unexpected symbols after the end of the formula");
  return f;
}

// ---------- printing ----------

const SYM = { and: "∧", or: "∨", imp: "→", iff: "↔" } as const;

export function show(f: Formula): string {
  switch (f.t) {
    case "atom":
      return f.args.length ? `${f.pred}(${f.args.join(", ")})` : f.pred;
    case "eq":
      return `${f.l} = ${f.r}`;
    case "bot":
      return "⊥";
    case "not":
      if (f.a.t === "eq") return `${f.a.l} ≠ ${f.a.r}`;
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
    .replace(/[~!]/g, "¬")
    .replace(/#/g, "⊥")
    .replace(/\bA([u-z])\b/g, "∀$1")
    .replace(/\bE([u-z])\b/g, "∃$1");
}

// ---------- comparison and substitution ----------

type Env = Map<string, number>;
type TermCmp = (s: string, t: string, ea: Env, eb: Env) => boolean;

/** Walk two formulas in lockstep, comparing term positions with `cmp`. Bound variables are compared up to renaming. */
function walk(a: Formula, b: Formula, cmp: TermCmp, ea: Env = new Map(), eb: Env = new Map(), lvl = 0): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case "bot":
      return true;
    case "atom": {
      const bb = b as typeof a;
      return a.pred === bb.pred && a.args.length === bb.args.length && a.args.every((s, i) => cmp(s, bb.args[i], ea, eb));
    }
    case "eq": {
      const bb = b as typeof a;
      return cmp(a.l, bb.l, ea, eb) && cmp(a.r, bb.r, ea, eb);
    }
    case "not":
      return walk(a.a, (b as typeof a).a, cmp, ea, eb, lvl);
    case "all":
    case "ex": {
      const bb = b as typeof a;
      const ea2 = new Map(ea).set(a.v, lvl);
      const eb2 = new Map(eb).set(bb.v, lvl);
      return walk(a.body, bb.body, cmp, ea2, eb2, lvl + 1);
    }
    default: {
      const bb = b as Binary;
      return walk(a.a, bb.a, cmp, ea, eb, lvl) && walk(a.b, bb.b, cmp, ea, eb, lvl);
    }
  }
}

const sameTerm: TermCmp = (s, t, ea, eb) => {
  const x = ea.get(s);
  const y = eb.get(t);
  if (x !== undefined || y !== undefined) return x === y;
  return s === t;
};

/** Syntactic identity up to renaming of bound variables. */
export function equal(a: Formula, b: Formula): boolean {
  return walk(a, b, sameTerm);
}

/**
 * Is `target` the result of substituting some single name for the free
 * occurrences of `v` in `body`? Returns that name, `null` when `v` does not
 * occur free (so any name works), or `false` when it is not an instance.
 */
export function instanceTerm(body: Formula, v: string, target: Formula): string | null | false {
  let found: string | null = null;
  const ok = walk(body, target, (s, t, ea, eb) => {
    if (s === v && !ea.has(s)) {
      if (eb.has(t)) return false;
      if (found === null) found = t;
      return found === t;
    }
    return sameTerm(s, t, ea, eb);
  });
  return ok ? found : false;
}

/** Does `to` arise from `from` by replacing some free occurrences of name `x` with `y`? */
export function replacesSome(from: Formula, to: Formula, x: string, y: string): boolean {
  return walk(from, to, (s, t, ea, eb) => {
    if (!ea.has(s) && !eb.has(t) && s === x && t === y) return true;
    return sameTerm(s, t, ea, eb);
  });
}

/** Names occurring free in a formula (its constants, in a closed formula). */
export function freeNames(f: Formula, bound: Set<string> = new Set(), out: Set<string> = new Set()): Set<string> {
  const add = (s: string) => {
    if (!bound.has(s)) out.add(s);
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

/** Flatten nested applications of an associative connective. */
export function flatten(f: Formula, op: "and" | "or"): Formula[] {
  return f.t === op ? [...flatten(f.a, op), ...flatten(f.b, op)] : [f];
}
