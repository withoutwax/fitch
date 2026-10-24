import { equal, flatten, freeNames, instanceTerm, parseFormula, ParseError, replacesSome, show, type Formula } from "./formula";
import { RULE_BY_ID, type RuleId } from "./rules";

export type LineKind = "premise" | "assumption" | "step";

export interface ProofLine {
  id: string;
  depth: number;
  kind: LineKind;
  text: string;
  rule: RuleId | "";
  refs: string;
}

export interface LineResult {
  ok: boolean;
  error?: string;
  formula?: Formula;
  /** Boxed constant introduced by an assumption line, e.g. "[c]". */
  boxed?: string;
}

export interface CheckResult {
  lines: LineResult[];
  valid: boolean;
  solved: boolean;
  message: string;
}

interface Subproof {
  start: number;
  end: number;
  depth: number;
}

interface CitedSubproof {
  assumption: Formula | null;
  boxed: string | null;
  last: Formula;
}

class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
}

/** Parse an assumption line, which may open with a boxed constant: "[c]" or "[c] P(c)". */
export function parseAssumption(text: string): { boxed?: string; formula?: Formula } {
  const m = /^\s*\[\s*([^\]]*?)\s*\]\s*(.*)$/.exec(text);
  if (!m) return { formula: parseFormula(text) };
  if (!/^[a-z][A-Za-z0-9_']*$/.test(m[1])) throw new ParseError("A boxed constant must be a lowercase name, like [c]");
  return { boxed: m[1], formula: m[2].trim() ? parseFormula(m[2]) : undefined };
}

type Ref = { from: number; to: number };

export function parseRefs(src: string): Ref[] {
  const refs: Ref[] = [];
  for (const part of src.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(p);
    if (!m) throw new RuleError(`Can't read the citation “${p}”. Use forms like 2 or 3-5.`);
    const from = Number(m[1]) - 1;
    const to = m[2] ? Number(m[2]) - 1 : from;
    if (to < from) throw new RuleError(`Range ${p} runs backwards`);
    refs.push({ from, to });
  }
  return refs;
}

export function checkProof(lines: ProofLine[], goal?: Formula): CheckResult {
  const n = lines.length;
  const results: LineResult[] = lines.map(() => ({ ok: true }));
  const err = (i: number, msg: string) => {
    if (results[i].ok) results[i] = { ...results[i], ok: false, error: msg };
  };

  // ---- structure: which subproofs contain each line ----
  const subs: Subproof[] = [];
  const ctx: number[][] = [];
  const stack: number[] = [];
  const close = (end: number) => {
    subs[stack.pop()!].end = end;
  };
  for (let i = 0; i < n; i++) {
    const { depth, kind } = lines[i];
    while (stack.length && subs[stack[stack.length - 1]].depth > depth) close(i - 1);
    const cur = () => (stack.length ? subs[stack[stack.length - 1]].depth : 0);
    if (kind === "premise") {
      if (depth !== 0 || i > 0 && lines[i - 1].kind !== "premise") err(i, "Premises must come first, at the outer level");
    } else if (kind === "assumption") {
      if (stack.length && cur() === depth) close(i - 1);
      if (depth !== cur() + 1) err(i, "This assumption is nested more deeply than any open subproof allows");
      subs.push({ start: i, end: n - 1, depth });
      stack.push(subs.length - 1);
    } else if (depth !== cur()) {
      err(i, "This line is not inside an open subproof at this depth");
    }
    ctx.push([...stack]);
  }
  while (stack.length) close(n - 1);

  const lineAccessible = (j: number, i: number) => j < i && ctx[j].every((s) => ctx[i].includes(s));
  const subAt = (start: number) => subs.findIndex((s) => s.start === start);

  // ---- parse every line ----
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    try {
      if (line.kind === "assumption") {
        const { boxed, formula } = parseAssumption(line.text);
        if (!boxed && !formula) fail("Empty assumption");
        results[i] = { ...results[i], boxed, formula };
      } else {
        results[i] = { ...results[i], formula: parseFormula(line.text) };
      }
    } catch (e) {
      err(i, e instanceof Error ? e.message : String(e));
    }
  }

  // ---- justify every line ----
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    const res = results[i];
    if (!res.ok) continue;
    try {
      if (line.kind === "premise") continue;
      if (line.kind === "assumption") {
        if (res.boxed) {
          const c = res.boxed;
          for (let j = 0; j < i; j++) {
            if (!lineAccessible(j, i)) continue;
            const r = results[j];
            if (r.boxed === c || (r.formula && freeNames(r.formula).has(c)))
              fail(`The boxed constant ${c} must be new, but it already appears on line ${j + 1}`);
          }
        }
        continue;
      }
      if (!line.rule) fail("Choose a rule to justify this line");
      const cites = parseRefs(line.refs);
      const cLines: Formula[] = [];
      const cSubs: CitedSubproof[] = [];
      for (const { from, to } of cites) {
        if (from < 0 || to >= n) fail(`There is no line ${(from < 0 ? from : to) + 1}`);
        if (to >= i) fail(`Line ${i + 1} can only cite earlier lines`);
        // A single number cites a line if it is accessible; otherwise it may
        // name a one-line subproof (an assumption that is also its conclusion).
        if (from === to && lineAccessible(from, i)) {
          const r = results[from];
          if (!r.ok) fail(`Line ${from + 1} has an error, fix it first`);
          if (!r.formula) fail(`Line ${from + 1} only introduces a boxed constant`);
          cLines.push(r.formula!);
          continue;
        }
        if (from === to && lines[from].kind !== "assumption") fail(`Line ${from + 1} is inside a subproof that has already ended`);
        const s = subAt(from);
        if (s < 0) fail(`Lines ${from + 1}–${to + 1} are not a subproof (a subproof begins with an assumption)`);
        const sub = subs[s];
        if (sub.end !== to) fail(`The subproof starting at line ${from + 1} ends at line ${sub.end + 1}, not ${to + 1}`);
        if (ctx[i].includes(s)) fail(`Line ${i + 1} is still inside the subproof ${from + 1}–${to + 1}; end it first`);
        const outer = ctx[from].filter((x) => x !== s);
        if (!outer.every((x) => ctx[i].includes(x))) fail(`The subproof ${from + 1}–${to + 1} is not accessible from line ${i + 1}`);
        for (let k = from; k <= to; k++) if (!results[k].ok) fail(`Line ${k + 1} inside the cited subproof has an error`);
        const last = results[to].formula;
        if (!last) fail(`The subproof ${from + 1}–${to + 1} has no conclusion`);
        cSubs.push({ assumption: results[from].formula ?? null, boxed: results[from].boxed ?? null, last: last! });
      }
      applyRule(line.rule as RuleId, res.formula!, cLines, cSubs);
    } catch (e) {
      if (e instanceof RuleError) err(i, e.message);
      else throw e;
    }
  }

  const valid = results.every((r) => r.ok);
  let solved = false;
  let message: string;
  const last = n - 1;
  if (!valid) {
    const bad = results.findIndex((r) => !r.ok);
    message = `Line ${bad + 1}: ${results[bad].error}`;
  } else if (!goal) {
    message = "Every line checks out.";
  } else if (last < 0 || lines[last].depth !== 0 || lines[last].kind !== "step") {
    message = "Every line checks out, but the proof must end on the outer level (close all subproofs).";
  } else if (!equal(results[last].formula!, goal)) {
    message = `Every line checks out, but the last line should be the goal ${show(goal)}.`;
  } else {
    solved = true;
    message = "Proof complete!";
  }
  return { lines: results, valid, solved, message };
}

function expectCites(rule: RuleId, lines: Formula[], subs: CitedSubproof[], nLines: number | [number, number], nSubs: number) {
  const [lo, hi] = Array.isArray(nLines) ? nLines : [nLines, nLines];
  if (lines.length < lo || lines.length > hi || subs.length !== nSubs) {
    fail(`${RULE_BY_ID[rule].label} cites ${RULE_BY_ID[rule].cites}`);
  }
}

function requireOrdinary(s: CitedSubproof, label: string): Formula {
  if (s.boxed || !s.assumption) fail(`${label} needs an ordinary subproof, not one with a boxed constant`);
  return s.assumption!;
}

function applyRule(rule: RuleId, f: Formula, L: Formula[], S: CitedSubproof[]): void {
  const label = RULE_BY_ID[rule].label;
  switch (rule) {
    case "reit":
      expectCites(rule, L, S, 1, 0);
      if (!equal(L[0], f)) fail("Reit must repeat the cited formula exactly");
      return;

    case "andI": {
      expectCites(rule, L, S, [1, 2], 0);
      if (f.t !== "and") fail("∧I must produce a conjunction");
      const parts = flatten(f, "and");
      const binary = f.t === "and" ? [f.a, f.b] : [];
      const covers = (want: Formula[]) => want.every((w) => L.some((l) => equal(l, w))) && L.every((l) => want.some((w) => equal(l, w)));
      if (!covers(binary) && !covers(parts)) fail("Each conjunct must be one of the cited lines");
      return;
    }

    case "andE": {
      expectCites(rule, L, S, 1, 0);
      if (L[0].t !== "and") fail("∧E must cite a conjunction");
      const g = L[0];
      if (![g.a, g.b, ...flatten(g, "and")].some((c) => equal(c, f))) fail(`${show(f)} is not a conjunct of the cited line`);
      return;
    }

    case "orI": {
      expectCites(rule, L, S, 1, 0);
      if (f.t !== "or") fail("∨I must produce a disjunction");
      const d = f;
      if (![d.a, d.b, ...flatten(d, "or")].some((x) => equal(x, L[0]))) fail("The cited line must be one of the disjuncts");
      return;
    }

    case "orE": {
      expectCites(rule, L, S, 1, S.length);
      const g = L[0];
      if (g.t !== "or") fail("∨E must cite a disjunction");
      if (S.length < 2) fail("∨E needs one subproof for each disjunct");
      const assumed = S.map((s) => requireOrdinary(s, label));
      const options = [[g.a, g.b], flatten(g, "or")];
      const fits = options.some(
        (ds) => ds.length === S.length && ds.every((d) => assumed.some((a) => equal(a, d))) && assumed.every((a) => ds.some((d) => equal(a, d))),
      );
      if (!fits) fail("Each subproof must assume one disjunct of the cited line, one subproof per disjunct");
      S.forEach((s) => {
        if (!equal(s.last, f)) fail(`Each subproof must end with ${show(f)}`);
      });
      return;
    }

    case "impI": {
      expectCites(rule, L, S, 0, 1);
      const a = requireOrdinary(S[0], label);
      if (f.t !== "imp") fail("→I must produce a conditional");
      const g = f;
      if (!equal(a, g.a)) fail(`The subproof must assume the antecedent ${show(g.a)}`);
      if (!equal(S[0].last, g.b)) fail(`The subproof must end with the consequent ${show(g.b)}`);
      return;
    }

    case "impE": {
      expectCites(rule, L, S, 2, 0);
      const ok = [0, 1].some((k) => {
        const c = L[k];
        return c.t === "imp" && equal(c.a, L[1 - k]) && equal(c.b, f);
      });
      if (!ok) fail("→E needs a conditional P → Q and its antecedent P, and produces Q");
      return;
    }

    case "iffI": {
      expectCites(rule, L, S, 0, 2);
      if (f.t !== "iff") fail("↔I must produce a biconditional");
      const g = f;
      const [s1, s2] = S.map((s) => ({ a: requireOrdinary(s, label), z: s.last }));
      const dir = (s: { a: Formula; z: Formula }, x: Formula, y: Formula) => equal(s.a, x) && equal(s.z, y);
      if (!((dir(s1, g.a, g.b) && dir(s2, g.b, g.a)) || (dir(s1, g.b, g.a) && dir(s2, g.a, g.b))))
        fail(`↔I needs one subproof ${show(g.a)} … ${show(g.b)} and one ${show(g.b)} … ${show(g.a)}`);
      return;
    }

    case "iffE": {
      expectCites(rule, L, S, 2, 0);
      const ok = [0, 1].some((k) => {
        const c = L[k];
        const o = L[1 - k];
        return c.t === "iff" && ((equal(c.a, o) && equal(c.b, f)) || (equal(c.b, o) && equal(c.a, f)));
      });
      if (!ok) fail("↔E needs P ↔ Q and one side, and produces the other side");
      return;
    }

    case "notI": {
      expectCites(rule, L, S, 0, 1);
      const a = requireOrdinary(S[0], label);
      if (f.t !== "not") fail("¬I must produce a negation");
      if (S[0].last.t !== "bot") fail("The subproof must end with ⊥");
      if (!equal(a, f.a)) fail(`The subproof must assume ${show(f.a)}`);
      return;
    }

    case "notE": {
      expectCites(rule, L, S, 1, 0);
      const g = L[0];
      if (!(g.t === "not" && g.a.t === "not" && equal(g.a.a, f))) fail("¬E turns ¬¬P into P");
      return;
    }

    case "botI": {
      expectCites(rule, L, S, 2, 0);
      if (f.t !== "bot") fail("⊥I must produce ⊥");
      const ok = [0, 1].some((k) => {
        const c = L[k];
        return c.t === "not" && equal(c.a, L[1 - k]);
      });
      if (!ok) fail("⊥I needs a formula P and its negation ¬P");
      return;
    }

    case "botE":
      expectCites(rule, L, S, 1, 0);
      if (L[0].t !== "bot") fail("⊥E must cite ⊥");
      return;

    case "eqI":
      expectCites(rule, L, S, 0, 0);
      if (!(f.t === "eq" && f.l === f.r)) fail("=I produces a formula of the form a = a");
      return;

    case "eqE": {
      expectCites(rule, L, S, 2, 0);
      const ok = [0, 1].some((k) => {
        const id = L[k];
        const g = L[1 - k];
        return id.t === "eq" && (replacesSome(g, f, id.l, id.r) || replacesSome(g, f, id.r, id.l));
      });
      if (!ok) fail("=E needs P(a) and a = b, and replaces some occurrences of a with b");
      return;
    }

    case "allE": {
      expectCites(rule, L, S, 1, 0);
      const g = L[0];
      if (g.t !== "all") fail("∀E must cite a universal ∀x …");
      const gg = g;
      if (instanceTerm(gg.body, gg.v, f) === false) fail(`${show(f)} is not an instance of ${show(g)}`);
      return;
    }

    case "allI": {
      expectCites(rule, L, S, 0, 1);
      const s = S[0];
      if (!s.boxed) fail("∀I needs a subproof that begins with a boxed constant, like [c]");
      if (f.t !== "all") fail("∀I must produce a universal ∀x …");
      const g = f;
      const c = s.boxed!;
      const target: Formula = s.assumption ? { t: "imp", a: s.assumption, b: s.last } : s.last;
      const term = instanceTerm(g.body, g.v, target);
      if (term === false || (term !== null && term !== c))
        fail(`Replacing ${g.v} with ${c} in ${show(g.body)} must give ${show(target)}`);
      if (freeNames(f).has(c)) fail(`The boxed constant ${c} can't appear in the conclusion`);
      return;
    }

    case "exI": {
      expectCites(rule, L, S, 1, 0);
      if (f.t !== "ex") fail("∃I must produce an existential ∃x …");
      const g = f;
      if (instanceTerm(g.body, g.v, L[0]) === false) fail(`The cited line is not an instance of ${show(f)}`);
      return;
    }

    case "exE": {
      expectCites(rule, L, S, 1, 1);
      const g = L[0];
      if (g.t !== "ex") fail("∃E must cite an existential ∃x …");
      const gg = g;
      const s = S[0];
      if (!s.boxed || !s.assumption) fail("∃E needs a subproof that begins with a boxed constant and an instance, like [c] P(c)");
      const term = instanceTerm(gg.body, gg.v, s.assumption!);
      if (term === false || (term !== null && term !== s.boxed))
        fail(`The subproof must assume ${show(gg.body)} with ${gg.v} replaced by ${s.boxed}`);
      if (!equal(s.last, f)) fail(`The subproof must end with ${show(f)}`);
      if (freeNames(f).has(s.boxed!)) fail(`The boxed constant ${s.boxed} can't appear in the conclusion`);
      return;
    }
  }
}
