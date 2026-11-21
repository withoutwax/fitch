import { checkProof, parseRefs, type ProofLine, type ProofOptions } from "./checker";
import { equal, freeNames, parseFormula, parseTerm, replacementVariants, replaceTerms, show, strictEqual, type Binary, type Formula } from "./formula";
import { advancedRuleSupportIndices } from "./advancedRules";
import { RULE_BY_ID, type RuleId } from "./rules";

// The button-driven way of building a proof: tick lines, click a rule, and the
// conclusion is worked out here. Every new line still has to pass the checker
// before it joins the proof, so the checker stays the only judge of validity.

let idCounter = 0;
export const newId = () => `l${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export type Action = RuleId | "assume" | "premise";

/** A question to put to the student before a rule can produce its line. */
export interface Prompt {
  title: string;
  help: string;
  initial: string;
  placeholder: string;
  /** The student enters a single name rather than a formula. */
  term?: boolean;
  second?: { label: string; initial: string; placeholder: string };
}

export type Outcome =
  | { kind: "done"; lines: ProofLine[]; level: number }
  | { kind: "prompt"; prompt: Prompt }
  | { kind: "error"; error: string };

export interface Attempt {
  lines: ProofLine[];
  /** Line ids in the order they were ticked. */
  checked: string[];
  /** Depth the next line goes on. */
  level: number;
  input?: string;
  secondary?: string;
  options?: ProofOptions;
}

class ActionError extends Error {}

function fail(msg: string): never {
  throw new ActionError(msg);
}

interface Sub {
  start: number;
  end: number;
  depth: number;
}

function subproofs(lines: ProofLine[]): Sub[] {
  const subs: Sub[] = [];
  const stack: Sub[] = [];
  lines.forEach((line, i) => {
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.depth > line.depth || (line.kind === "assumption" && top.depth === line.depth)) {
        top.end = i - 1;
        stack.pop();
      } else break;
    }
    if (line.kind === "assumption") {
      const sub = { start: i, end: lines.length - 1, depth: line.depth };
      subs.push(sub);
      stack.push(sub);
    }
  });
  return subs;
}

export const lastDepth = (lines: ProofLine[]) => lines[lines.length - 1]?.depth ?? 0;

const text = (f: Formula) => show(f);

function freshVariable(f: Formula): string {
  const used = new Set(show(f).match(/[a-z][A-Za-z0-9_']*/g) ?? []);
  return ["x", "y", "z", "u", "v", "w"].find((v) => !used.has(v)) ?? "x";
}

// As in Stanford's Fitch, only these two rules discharge a subproof.
const ALL_RULE_NAMES = new Set(["Premise", "Assumption", "Truth Table", ...Object.values(RULE_BY_ID).map((r) => r.name)]);
const NEEDS_SUBPROOF: Partial<Record<RuleId, number>> = { impI: 1, botE: 1 };

export function needsSubproof(rule: RuleId) {
  return rule in NEEDS_SUBPROOF;
}

export function runAction(action: Action, attempt: Attempt): Outcome {
  try {
    return attemptAction(action, attempt);
  } catch (e) {
    if (e instanceof ActionError) return { kind: "error", error: e.message };
    return { kind: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

function attemptAction(action: Action, { lines, checked, level, input, secondary, options = {} }: Attempt): Outcome {
  const same = options.exactSyntax ? strictEqual : equal;
  const results = checkProof(lines, undefined, options).lines;
  const subs = subproofs(lines);
  const ticked = checked.map((id) => lines.findIndex((l) => l.id === id)).filter((i) => i >= 0);
  if (options.exactSyntax) ticked.sort((a, b) => a - b);

  const isOpen = (s: Sub, depth: number) => s.end === lines.length - 1 && s.depth <= depth;

  // Sort the ticked lines, as seen from a new line at this depth, into lines it
  // can cite directly and the closed subproofs they sit in.
  const resolve = (depth: number) => {
    const direct: number[] = [];
    const closed: Sub[] = [];
    for (const j of ticked) {
      const outer = subs.filter((s) => s.start <= j && j <= s.end && !isOpen(s, depth)).sort((a, b) => a.depth - b.depth)[0];
      const compatible = results[j].ok && results[j].assumptions.every((index) =>
        subs.some((s) => s.start === index && isOpen(s, depth))
      );
      if (!outer || compatible) direct.push(j);
      if (outer && !compatible && !closed.includes(outer)) closed.push(outer);
    }
    return { direct, closed };
  };

  const formulaAt = (j: number): Formula => parseFormula(lines[j].text);

  const describe = (s: Sub) => ({ assumption: formulaAt(s.start), last: formulaAt(s.end), range: `${s.start + 1}-${s.end + 1}` });

  // Rules that discharge subproofs take the ticked ones. Failing that they use
  // the one that just ended, and then the innermost one still open, closing it.
  const withSubproofs = (count: number) => {
    if (options.exactSyntax) {
      const inner = subs.filter((s) => isOpen(s, level)).at(-1);
      if (!inner) fail("Open an assumption first.");
      return { depth: inner.depth - 1, closed: [inner] };
    }
    const gather = (depth: number) => {
      const { direct, closed } = resolve(depth);
      const justEnded = subs.find((s) => s.end === lines.length - 1 && s.depth === depth + 1);
      return { depth, direct, closed: closed.length < count && justEnded && !closed.includes(justEnded) ? [...closed, justEnded] : closed };
    };
    let found = gather(level);
    if (found.closed.length < count && level > 0) found = gather(level - 1);
    const { depth, direct, closed } = found;
    if (closed.length < count) fail(`This rule needs ${count === 1 ? "a subproof" : `${count} subproofs`}. Tick a line in each finished subproof.`);
    if (closed.length > count) fail(`This rule uses ${count === 1 ? "one subproof" : `${count} subproofs`}, but you ticked lines in ${closed.length}.`);
    return { depth, direct, closed };
  };

  const onlyLines = (count: number, what: string) => {
    const { direct, closed } = resolve(level);
    if (closed.length) fail(`Line ${closed[0].start + 1}'s subproof has ended, so its lines can't be used here.`);
    if (direct.length !== count) fail(`Tick ${what}.`);
    return direct;
  };

  const refOf = (ns: number[]) => ns.map((n) => n + 1).join(", ");

  type NewStep = Pick<ProofLine, "text" | "rule" | "refs" | "depth" | "justification">;
  const makeSteps = (rows: NewStep[]): ProofLine[] => rows.map((row) => ({ id: newId(), kind: "step", ...row }));
  const finish = (rows: NewStep[]): Outcome => commit(lines, makeSteps(rows), options);

  const ask = (prompt: Prompt): Outcome => ({ kind: "prompt", prompt });

  const given = () => {
    const value = input?.trim();
    if (!value) fail("Enter something first.");
    return value;
  };

  const entered = () => text(parseFormula(given()));

  const enteredName = () => {
    const name = given();
    if (!/^[a-z][A-Za-z0-9_']*$/.test(name)) fail("A name starts with a lowercase letter, like a or b.");
    return name;
  };

  if (action === "premise") {
    if (input === undefined) return ask({ title: "Premise", help: "Enter a sentence to add as a premise.", initial: "", placeholder: "p(a)" });
    const line: ProofLine = { id: newId(), depth: level, kind: "premise", text: entered(), rule: "", refs: "" };
    return commit(lines, [line], options);
  }

  if (action === "assume") {
    if (input === undefined)
      return ask({
        title: "Assumption",
        help: "Enter the assumption to make. Close it with Implication Introduction, or with False Elimination once you reach ⊥.",
        initial: "",
        placeholder: "P ∧ Q",
      });
    const value = entered();
    const line: ProofLine = { id: newId(), depth: level + 1, kind: "assumption", text: value, rule: "", refs: "" };
    return commit(lines, [line], options);
  }

  const rule = action;
  const step = (f: Formula | string, refs: string, depth = level) => ({ text: typeof f === "string" ? f : text(f), rule, refs, depth });

  const finishApplicable = (rows: NewStep[]) => {
    const added = makeSteps(rows);
    const validation = checkProof([...lines, ...added], undefined, options).lines.slice(lines.length);
    const applicable = added.filter((_, i) => validation[i].ok);
    if (!applicable.length) fail(validation[0]?.error ?? "The selected lines do not justify a conclusion for this rule.");
    return commit(lines, applicable, options);
  };

  if (options.exactSyntax && isSelectionRule(rule)) {
    const direct = resolve(level).direct.filter((j) => results[j].ok);
    if (!direct.length) fail("Select at least one compatible line.");
    if (rule === "orI" && input === undefined) {
      return ask({ title: "Or Introduction", help: "Enter the sentence to join with the selected lines.", initial: "", placeholder: "q" });
    }
    const rows = selectedConclusions(rule, direct, formulaAt, rule === "orI" ? parseFormula(given()) : undefined);
    if (!rows.length) fail("The selected lines do not justify a conclusion for this rule.");
    return finish(rows.map(({ formula, refs }) => step(formula, refOf(refs))));
  }

  switch (rule) {
    case "shortcut": {
      if (!options.allowShortcut) fail("Shortcuts are unavailable for this proof.");
      if (input === undefined) return ask({
        title: "Shortcut", help: "Enter a conclusion and its justification.", initial: "", placeholder: "q",
        second: { label: "Justification", initial: "", placeholder: "Previously established theorem" },
      });
      const justification = secondary?.trim();
      if (!justification) fail("Enter a justification for the shortcut.");
      if (RULE_BY_ID[rule].name === justification || ALL_RULE_NAMES.has(justification)) fail("Choose a justification distinct from a built-in rule.");
      return finish([{ ...step(entered(), refOf(resolve(level).direct)), justification }]);
    }

    case "truthTable":
    case "domainClosure":
    case "induction":
    case "rationalEquation":
    case "rationalInduction": {
      if (!options.allowAdvanced) fail("This rule is unavailable for the current exercise.");
      if (input === undefined) return ask({
        title: RULE_BY_ID[rule].name,
        help: RULE_BY_ID[rule].description,
        initial: "",
        placeholder: rule === "rationalEquation" ? "1 + 2" : "AX:p(X)",
        term: rule === "rationalEquation",
        second: rule === "rationalEquation" ? { label: "Right-hand term", initial: "", placeholder: "3" } : undefined,
      });
      const f: Formula = rule === "rationalEquation" && secondary !== undefined
        ? { t: "eq", l: parseTerm(given()), r: parseTerm(secondary.trim()) }
        : parseFormula(given());
      const direct = rule === "rationalEquation" ? [] : resolve(level).direct.filter((j) => results[j].ok);
      const supports = advancedRuleSupportIndices(
        rule, f, direct.map(formulaAt), options.vocabulary ?? { objects: [], functions: [] },
        results.flatMap((r) => r.ok && r.formula ? [r.formula] : []),
      );
      if (supports === false) fail("The selected lines and vocabulary do not justify this conclusion.");
      return finish([step(f, refOf(supports.map((i) => direct[i])))]);
    }

    case "reit": {
      const { direct, closed } = resolve(level);
      if (closed.length && !options.exactSyntax) fail(`Line ${closed[0].start + 1}'s subproof has ended, so its lines can't be reiterated here.`);
      if (!direct.length) fail("Tick the lines to repeat.");
      return finish(direct.map((j) => step(formulaAt(j), refOf([j]))));
    }

    case "andI": {
      const { direct, closed } = resolve(level);
      if (closed.length) fail(`Line ${closed[0].start + 1}'s subproof has ended, so its lines can't be used here.`);
      if (direct.length < 1 || direct.length > 2) fail("Tick the two lines to join, left conjunct first.");
      const [a, b = a] = direct;
      return finish([step({ t: "and", a: formulaAt(a), b: formulaAt(b) }, refOf(direct))]);
    }

    case "andE": {
      const [j] = onlyLines(1, "one conjunction");
      const f = formulaAt(j);
      if (f.t !== "and") fail(`Line ${j + 1} is not a conjunction.`);
      const parts = same(f.a, f.b) ? [f.a] : [f.a, f.b];
      return finish(parts.map((p) => step(p, refOf([j]))));
    }

    case "orI": {
      const [j] = onlyLines(1, "the line to weaken");
      if (input === undefined)
        return ask({
          title: "Or Introduction",
          help: "Enter the disjunction to conclude. The ticked line must be one side of it.",
          initial: `${text(formulaAt(j))} ∨ `,
          placeholder: "P ∨ Q",
        });
      return finish([step(entered(), refOf([j]))]);
    }

    case "orE": {
      const [x, y, z] = onlyLines(3, "the disjunction P ∨ Q and the conditionals P → R and Q → R");
      const fs = [x, y, z].map(formulaAt);
      const d = fs.find((f) => f.t === "or");
      if (d?.t !== "or") fail("None of the ticked lines is a disjunction.");
      const from = (side: Formula) => fs.find((f) => f.t === "imp" && same(f.a, side));
      const p = from(d.a);
      const q = from(d.b);
      if (p?.t !== "imp" || q?.t !== "imp" || !same(p.b, q.b)) fail("Tick P ∨ Q with P → R and Q → R, both ending in the same R.");
      return finish([step(p.b, refOf([x, y, z]))]);
    }

    case "impI": {
      const { depth, closed } = withSubproofs(1);
      const { assumption, last, range } = describe(closed[0]);
      return finish([step({ t: "imp", a: assumption, b: last }, range, depth)]);
    }

    case "impE": {
      const [x, y] = onlyLines(2, "the implication and its antecedent");
      const [p, q] = [formulaAt(x), formulaAt(y)];
      const result = (c: Formula, o: Formula) => (c.t === "imp" && same(c.a, o) ? c.b : null);
      const f = result(p, q) ?? result(q, p);
      if (!f) fail("Those lines aren't an implication and its antecedent.");
      return finish([step(f, refOf([x, y]))]);
    }

    case "iffI": {
      const [x, y] = onlyLines(2, "the two conditionals P → Q and Q → P");
      const [p, q] = [formulaAt(x), formulaAt(y)];
      if (!(p.t === "imp" && q.t === "imp" && same(p.a, q.b) && same(p.b, q.a))) fail("Those lines aren't two conditionals P → Q and Q → P.");
      return finish([step({ t: "iff", a: p.a, b: p.b }, refOf([x, y]))]);
    }

    case "iffE": {
      const [j] = onlyLines(1, "one biconditional");
      const f = formulaAt(j);
      if (f.t !== "iff") fail(`Line ${j + 1} is not a biconditional.`);
      const both = [{ t: "imp", a: f.a, b: f.b }, { t: "imp", a: f.b, b: f.a }] as Formula[];
      return finish((same(f.a, f.b) ? both.slice(0, 1) : both).map((g) => step(g, refOf([j]))));
    }

    case "notI": {
      const [x, y] = onlyLines(2, "two conditionals P → Q and P → ¬Q");
      const [p, q] = [formulaAt(x), formulaAt(y)];
      const pair = (a: Formula, b: Formula) => a.t === "imp" && b.t === "imp" && same(a.a, b.a) && b.b.t === "not" && same(b.b.a, a.b);
      if (!pair(p, q) && !pair(q, p)) fail("Those lines aren't two conditionals P → Q and P → ¬Q with the same P.");
      return finish([step({ t: "not", a: (p as Binary).a }, refOf([x, y]))]);
    }

    case "notE": {
      const [j] = onlyLines(1, "one double negation");
      const f = formulaAt(j);
      if (!(f.t === "not" && f.a.t === "not")) fail(`Line ${j + 1} is not a double negation ¬¬P.`);
      return finish([step(f.a.a, refOf([j]))]);
    }

    case "botI": {
      const [x, y] = onlyLines(2, "a formula and its negation");
      return finish([step({ t: "bot" }, refOf([x, y]))]);
    }

    case "botE": {
      const { depth, closed } = withSubproofs(1);
      const { assumption, last, range } = describe(closed[0]);
      if (last.t !== "bot") fail("The subproof must end with ⊥. Use False Introduction first.");
      return finish([step({ t: "not", a: assumption }, range, depth)]);
    }

    case "eqI": {
      if (input === undefined) return ask({ title: "Equality Introduction", help: "Enter the term to use on both sides of the equality.", initial: "", placeholder: "a", term: true });
      const term = parseTerm(given());
      return finish([step({ t: "eq", l: term, r: term }, "")]);
    }

    case "eqE": {
      const direct = options.exactSyntax ? resolve(level).direct : onlyLines(2, "the equality and the line to rewrite");
      const [x, y] = direct;
      if (!direct.length) fail("Select an equality and a line to rewrite.");
      if (input === undefined)
        return ask({
          title: "Equality Elimination",
          help: "Enter the result, replacing some occurrences of one side of the equality with the other.",
          initial: text(formulaAt(formulaAt(x).t === "eq" ? y ?? x : x)),
          placeholder: "P(b)",
        });
      const conclusion = entered();
      if (!options.exactSyntax) return finish([step(conclusion, refOf([x, y]))]);
      for (const i of direct) {
        for (const j of direct) {
          if (formulaAt(j).t !== "eq") continue;
          const result = finish([step(conclusion, refOf([j, i]))]);
          if (result.kind === "done") return result;
        }
      }
      fail("The selected lines do not justify this substitution.");
    }

    case "allI": {
      const js = options.exactSyntax ? resolve(level).direct : onlyLines(1, "the line to generalize");
      if (!js.length) fail("Select a line to generalize.");
      const f = formulaAt(js[0]);
      if (input === undefined)
        return ask({
          title: "Universal Introduction",
          help: "Enter the name to replace with a variable. It must not appear in any premise or open assumption.",
          initial: [...freeNames(f)][0] ?? "",
          placeholder: "c",
          term: true,
          second: { label: "Variable", initial: options.exactSyntax ? freshVariable(f).toUpperCase() : freshVariable(f), placeholder: "X" },
        });
      const name = enteredName();
      const v = secondary?.trim() || freshVariable(f);
      if (!(options.exactSyntax ? /^[A-Z][A-Za-z0-9_']*$/ : /^[A-Za-z][A-Za-z0-9_']*$/).test(v)) fail("Enter a variable name.");
      if (options.vocabulary?.objects.includes(name) || options.vocabulary?.functions.includes(name)) {
        fail("Enter an undeclared placeholder.");
      }
      const eligible = options.exactSyntax ? js.filter((j) => !lines.some((line, index) => {
        const active = (line.kind === "premise" && index <= j) ||
          (line.kind === "assumption" && subs.some((sub) => sub.start === index && j >= index && j <= sub.end));
        const formula = results[index].formula;
        return active && !!formula && freeNames(formula).has(name);
      })) : js;
      if (!eligible.length) fail("The placeholder appears in an active premise or assumption.");
      return finishApplicable(eligible.map((j) => step({ t: "all", v, body: replaceTerms(formulaAt(j), name, v) }, refOf([j]))));
    }

    case "allE": {
      const js = options.exactSyntax ? resolve(level).direct : onlyLines(1, "one universal");
      if (!js.length) fail("Select a universal sentence.");
      if (input === undefined)
        return ask({ title: "Universal Elimination", help: "Enter the ground term to substitute.", initial: "", placeholder: "a", term: true });
      const term = parseTerm(given());
      return finishApplicable(js.flatMap((j) => {
        const f = formulaAt(j);
        return f.t === "all" ? [step(replaceTerms(f.body, f.v, term), refOf([j]))] : [];
      }));
    }

    case "exI": {
      if (options.exactSyntax) {
        const { direct } = resolve(level);
        if (!direct.length) fail("Select a line to generalize.");
        if (input === undefined) return ask({
          title: "Existential Introduction", help: "Choose the ground term and the variable to replace it with.",
          initial: "", placeholder: "a", term: true, second: { label: "Variable", initial: "X", placeholder: "X" },
        });
        const v = secondary?.trim();
        if (!v || !/^[A-Z][A-Za-z0-9_']*$/.test(v)) fail("Enter an uppercase variable name.");
        const term = parseTerm(given());
        return finishApplicable(direct.flatMap((j) => replacementVariants(formulaAt(j), term, v)
          .map((body) => step({ t: "ex", v, body }, refOf([j])))));
      }
      const [j] = onlyLines(1, "the line to generalize");
      if (input === undefined)
        return ask({
          title: "Existential Introduction",
          help: "Enter the existential to conclude, with the variable in place of the name it generalizes.",
          initial: `∃x ${text(formulaAt(j))}`,
          placeholder: "∃x P(x)",
        });
      return finish([step(entered(), refOf([j]))]);
    }

    case "exE": {
      if (options.exactSyntax) {
        const { direct } = resolve(level);
        return finishApplicable(direct.flatMap((i) => direct.flatMap((j) => {
          const e = formulaAt(i), u = formulaAt(j);
          return e.t === "ex" && u.t === "all" && u.body.t === "imp" && e.v === u.v && strictEqual(e.body, u.body.a)
            ? [step(u.body.b, refOf([i, j]))] : [];
        })));
      }
      const [x, y] = onlyLines(2, "the existential ∃x P(x) and the universal ∀x (P(x) → Q)");
      const [p, q] = [formulaAt(x), formulaAt(y)];
      const u = p.t === "all" ? p : q;
      if (u.t !== "all" || u.body.t !== "imp") fail("Tick ∃x P(x) and ∀x (P(x) → Q).");
      return finish([step(u.body.b, refOf([x, y]))]);
    }
  }
}

type SelectionRule = "andI" | "andE" | "orI" | "orE" | "impE" | "iffI" | "iffE" | "notI" | "notE" | "botI";

function isSelectionRule(rule: RuleId): rule is SelectionRule {
  const rules: readonly RuleId[] = ["andI", "andE", "orI", "orE", "impE", "iffI", "iffE", "notI", "notE", "botI"];
  return rules.includes(rule);
}

function selectedConclusions(rule: SelectionRule, selected: number[], formulaAt: (i: number) => Formula, input?: Formula) {
  const rows: { formula: Formula; refs: number[] }[] = [];
  const add = (formula: Formula, ...refs: number[]) => rows.push({ formula, refs });
  const binary = (t: Binary["t"], a: Formula, b: Formula): Formula => ({ t, a, b });
  const supports = selected.map((line) => ({ line, formula: formulaAt(line) }));
  for (const { line: i, formula: p } of supports) {
    if (rule === "andE" && p.t === "and") { add(p.a, i); add(p.b, i); }
    if (rule === "notE" && p.t === "not" && p.a.t === "not") add(p.a.a, i);
    if (rule === "iffE" && p.t === "iff") { add(binary("imp", p.a, p.b), i); add(binary("imp", p.b, p.a), i); }
    if (rule === "orI" && input) { add(binary("or", p, input), i); add(binary("or", input, p), i); }
    if (rule === "andE" || rule === "notE" || rule === "iffE" || rule === "orI") continue;
    for (const { line: j, formula: q } of supports) {
      if (rule === "andI") add(binary("and", p, q), i, j);
      if (rule === "impE" && p.t === "imp" && strictEqual(p.a, q)) add(p.b, i, j);
      if (rule === "botI" && q.t === "not" && strictEqual(p, q.a)) add({ t: "bot" }, i, j);
      if (rule === "iffI" && p.t === "imp" && q.t === "imp" && strictEqual(p.a, q.b) && strictEqual(p.b, q.a)) {
        add(binary("iff", p.a, p.b), i, j);
      }
      if (rule === "notI" && p.t === "imp" && q.t === "imp" && q.b.t === "not" && strictEqual(p.a, q.a) && strictEqual(p.b, q.b.a)) {
        add({ t: "not", a: p.a }, i, j);
      }
      if (rule === "orE" && p.t === "or" && q.t === "imp" && strictEqual(p.a, q.a)) {
        for (const { line: k, formula: r } of supports) {
          if (r.t === "imp" && strictEqual(p.b, r.a) && strictEqual(q.b, r.b)) add(r.b, i, j, k);
        }
      }
    }
  }
  return rows;
}

function commit(lines: ProofLine[], added: ProofLine[], options: ProofOptions): Outcome {
  const next = [...lines, ...added];
  const results = checkProof(next, undefined, options).lines;
  for (let i = lines.length; i < next.length; i++) {
    const r = results[i];
    if (!r.ok) return { kind: "error", error: r.error ?? `${added[i - lines.length].rule ? RULE_BY_ID[added[i - lines.length].rule as RuleId].name : "Assumption"} doesn't apply here.` };
  }
  return { kind: "done", lines: next, level: lastDepth(next) };
}

/** Lines that fall away with the chosen ones: the rest of a deleted assumption's subproof, and anything citing a deleted line. */
export function deleteLines(lines: ProofLine[], ids: string[]): { lines: ProofLine[]; removed: number } {
  const subs = subproofs(lines);
  const gone = new Set<number>();
  lines.forEach((l, i) => {
    if (ids.includes(l.id) && l.kind !== "premise") gone.add(i);
  });
  const citesOf = (line: ProofLine) => {
    try {
      return parseRefs(line.refs);
    } catch {
      return [];
    }
  };
  let changed = true;
  while (changed) {
    changed = false;
    lines.forEach((line, i) => {
      if (gone.has(i)) {
        const sub = subs.find((s) => s.start === i);
        if (sub) {
          for (let k = sub.start; k <= sub.end; k++) {
            if (!gone.has(k)) {
              gone.add(k);
              changed = true;
            }
          }
        }
        return;
      }
      if (citesOf(line).some(({ from, to }) => [...gone].some((g) => from <= g && g <= to))) {
        gone.add(i);
        changed = true;
      }
    });
  }
  const shift = (n: number) => n - [...gone].filter((g) => g < n).length;
  const renumber = (line: ProofLine) => {
    if (!line.refs.trim()) return line;
    const cites = citesOf(line);
    if (!cites.length) return line;
    return { ...line, refs: cites.map(({ from, to }) => (from === to ? `${shift(from) + 1}` : `${shift(from) + 1}-${shift(to) + 1}`)).join(", ") };
  };
  return { lines: lines.filter((_, i) => !gone.has(i)).map(renumber), removed: gone.size };
}

/** Drop the empty rows the old typing editor left in saved drafts. */
export function withoutBlanks(lines: ProofLine[]): ProofLine[] {
  const blanks = lines.filter((l) => l.kind !== "premise" && !l.text.trim()).map((l) => l.id);
  return blanks.length ? deleteLines(lines, blanks).lines : lines;
}
