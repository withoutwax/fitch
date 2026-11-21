import { equal, flatten, freeNames, instanceTerm, parseFormula, replacesSome, show, type Formula } from "./formula";
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
  assumption: Formula;
  last: Formula;
}

/** What a rule may need to know about where its cited lines sit. */
interface RuleContext {
  /** Premises and still-open assumptions in force at each cited line, in citation order. */
  actives: Formula[][];
}

class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
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
  // The premises, and the assumptions of the subproofs still open at line j.
  const activeAt = (j: number) =>
    [...lines.flatMap((l, k) => (l.kind === "premise" ? [k] : [])), ...ctx[j].map((s) => subs[s].start)]
      .map((k) => results[k]?.formula)
      .filter((f): f is Formula => !!f);

  // ---- parse every line ----
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    try {
      results[i] = { ...results[i], formula: parseFormula(line.text) };
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
      if (line.kind === "premise" || line.kind === "assumption") continue;
      if (!line.rule) fail("Choose a rule to justify this line");
      const cites = parseRefs(line.refs);
      const cLines: Formula[] = [];
      const cSubs: CitedSubproof[] = [];
      const actives: Formula[][] = [];
      for (const { from, to } of cites) {
        if (from < 0 || to >= n) fail(`There is no line ${(from < 0 ? from : to) + 1}`);
        if (to >= i) fail(`Line ${i + 1} can only cite earlier lines`);
        // A single number cites a line if it is accessible; otherwise it may
        // name a one-line subproof (an assumption that is also its conclusion).
        if (from === to && lineAccessible(from, i)) {
          const r = results[from];
          if (!r.ok) fail(`Line ${from + 1} has an error, fix it first`);
          cLines.push(r.formula!);
          actives.push(activeAt(from));
          continue;
        }
        if (from === to && lines[from].kind !== "assumption") fail(`Line ${from + 1} is inside a subproof that has already ended`);
        const s = subAt(from);
        if (s < 0) fail(`Lines ${from + 1}–${to + 1} are not a subproof (a subproof begins with an assumption)`);
        const sub = subs[s];
        if (sub.end !== to) fail(`The subproof starting at line ${from + 1} ends at line ${sub.end + 1}, not ${to + 1}`);
        if (ctx[to].at(-1) !== s) fail(`Line ${to + 1} is still under a nested assumption. Close that subproof before citing this one.`);
        if (ctx[i].includes(s)) fail(`Line ${i + 1} is still inside the subproof ${from + 1}–${to + 1}; end it first`);
        const outer = ctx[from].filter((x) => x !== s);
        if (!outer.every((x) => ctx[i].includes(x))) fail(`The subproof ${from + 1}–${to + 1} is not accessible from line ${i + 1}`);
        for (let k = from; k <= to; k++) if (!results[k].ok) fail(`Line ${k + 1} inside the cited subproof has an error`);
        const last = results[to].formula;
        if (!last) fail(`The subproof ${from + 1}–${to + 1} has no conclusion`);
        cSubs.push({ assumption: results[from].formula!, last: last! });
      }
      applyRule(line.rule as RuleId, res.formula!, cLines, cSubs, { actives });
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

// The rules follow Stanford's Fitch (logic.stanford.edu/logica/homepage/fitch.php).
// Only Implication Introduction and False Elimination discharge a subproof;
// every other rule works on lines.
function applyRule(rule: RuleId, f: Formula, L: Formula[], S: CitedSubproof[], ctx: RuleContext): void {
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
      expectCites(rule, L, S, 3, 0);
      // φ ∨ ψ, φ → χ, ψ → χ ⊢ χ
      const ok = [0, 1, 2].some((d) => {
        const g = L[d];
        if (g.t !== "or") return false;
        const [x, y] = L.filter((_, k) => k !== d);
        const conds = (p: Formula, q: Formula) =>
          p.t === "imp" && q.t === "imp" && equal(p.a, g.a) && equal(q.a, g.b) && equal(p.b, f) && equal(q.b, f);
        return conds(x, y) || conds(y, x);
      });
      if (!ok) fail(`∨E needs P ∨ Q, P → ${show(f)} and Q → ${show(f)}`);
      return;
    }

    case "impI": {
      expectCites(rule, L, S, 0, 1);
      const a = S[0].assumption;
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
      expectCites(rule, L, S, 2, 0);
      // φ → ψ, ψ → φ ⊢ φ ↔ ψ
      if (f.t !== "iff") fail("↔I must produce a biconditional");
      const g = f;
      const conv = (p: Formula, q: Formula) => p.t === "imp" && q.t === "imp" && equal(p.a, g.a) && equal(p.b, g.b) && equal(q.a, g.b) && equal(q.b, g.a);
      if (!conv(L[0], L[1]) && !conv(L[1], L[0])) fail(`↔I needs ${show(g.a)} → ${show(g.b)} and ${show(g.b)} → ${show(g.a)}`);
      return;
    }

    case "iffE": {
      expectCites(rule, L, S, 1, 0);
      // φ ↔ ψ ⊢ φ → ψ, and φ ↔ ψ ⊢ ψ → φ
      const g = L[0];
      if (g.t !== "iff") fail("↔E must cite a biconditional");
      const fwd: Formula = { t: "imp", a: g.a, b: g.b };
      const back: Formula = { t: "imp", a: g.b, b: g.a };
      if (!equal(f, fwd) && !equal(f, back)) fail(`↔E turns ${show(g)} into ${show(fwd)} or ${show(back)}`);
      return;
    }

    case "notI": {
      expectCites(rule, L, S, 2, 0);
      // φ → ψ, φ → ¬ψ ⊢ ¬φ
      if (f.t !== "not") fail("¬I must produce a negation");
      const phi = f.a;
      const pair = (p: Formula, q: Formula) => p.t === "imp" && q.t === "imp" && equal(p.a, phi) && equal(q.a, phi) && q.b.t === "not" && equal(q.b.a, p.b);
      if (!pair(L[0], L[1]) && !pair(L[1], L[0])) fail(`¬I needs ${show(phi)} → Q and ${show(phi)} → ¬Q`);
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

    case "botE": {
      expectCites(rule, L, S, 0, 1);
      // A subproof assuming φ and ending in ⊥ gives ¬φ.
      if (S[0].last.t !== "bot") fail("The subproof must end with ⊥");
      if (!(f.t === "not" && equal(f.a, S[0].assumption))) fail(`⊥E concludes ${show({ t: "not", a: S[0].assumption })}, the negation of the assumption`);
      return;
    }

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
      expectCites(rule, L, S, 1, 0);
      // φ ⊢ ∀x φ[c ↦ x], replacing every c, where c is in no premise or open assumption.
      if (f.t !== "all") fail("∀I must produce a universal ∀x …");
      const g = f;
      const c = instanceTerm(g.body, g.v, L[0]);
      if (c === false) fail(`${show(L[0])} is not ${show(g.body)} with a name in place of ${g.v}`);
      if (c !== null) {
        if (freeNames(f).has(c)) fail(`∀I must replace every ${c} with ${g.v}`);
        const used = ctx.actives[0].find((a) => freeNames(a).has(c));
        if (used) fail(`${c} appears in the premise or assumption ${show(used)}, so it can't be generalized`);
      }
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
      expectCites(rule, L, S, 2, 0);
      // ∃x φ, ∀x (φ → ψ) ⊢ ψ, where x is not free in ψ
      const ok = [0, 1].some((k) => {
        const e = L[k];
        const u = L[1 - k];
        if (e.t !== "ex" || u.t !== "all" || u.body.t !== "imp") return false;
        const same = equal({ t: "ex", v: e.v, body: e.body }, { t: "ex", v: u.v, body: u.body.a });
        return same && !freeNames(u.body.b).has(u.v) && equal(u.body.b, f);
      });
      if (!ok) fail("∃E needs ∃x P(x) and ∀x (P(x) → Q), where Q doesn't mention x, and produces Q");
      return;
    }
  }
}
