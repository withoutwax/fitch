import { parseRefs, type ProofLine } from "./checker";
import { parseFormula, parseTerm, replaceTerms, show, strictEqual, type Formula, type Term } from "./formula";

function refText(from: number, to: number) {
  return from === to ? String(from + 1) : `${from + 1}-${to + 1}`;
}

function isDischarge(line: ProofLine) {
  return line.rule === "impI" || line.rule === "botE";
}

function renumber(line: ProofLine, indexOf: (index: number) => number): ProofLine {
  return { ...line, refs: parseRefs(line.refs).map(({ from, to }) => refText(indexOf(from), indexOf(to))).join(", ") };
}

function withDepths(lines: ProofLine[]) {
  let depth = 0;
  return lines.map((line) => {
    if (line.kind === "assumption") depth++;
    if (isDischarge(line)) depth = Math.max(0, depth - 1);
    return { ...line, depth };
  });
}

export function copySelection(lines: ProofLine[], ids: string[]) {
  const selected = new Set(ids);
  const indices = lines.flatMap((line, index) => selected.has(line.id) ? [index] : []);
  const indexOf = (index: number) => indices.indexOf(index);
  const kept = indices.map((index) => {
    const line = lines[index];
    const refs = parseRefs(line.refs);
    const missing = refs.some(({ from, to }) => indexOf(from) < 0 || indexOf(to) < 0);
    if (missing) return { ...line, kind: "premise" as const, rule: "" as const, refs: "", justification: undefined };
    return renumber(line, indexOf);
  });
  return withDepths(kept);
}

export function pasteProof(lines: ProofLine[], incoming: ProofLine[], makeId: () => string, at = lines.length) {
  const before = lines.slice(0, at);
  const pasted = incoming.map((line) => ({ ...renumber(line, (j) => j + at), id: makeId() }));
  const after = lines.slice(at).map((line) => renumber(line, (j) => j >= at ? j + pasted.length : j));
  return withDepths([...before, ...pasted, ...after]);
}

export function deleteProofSelection(lines: ProofLine[], ids: string[]) {
  const selected = new Set(ids);
  const remaining: ProofLine[] = [];
  const indices: number[] = [];
  lines.forEach((line, i) => {
    if (selected.has(line.id) || parseRefs(line.refs).some(({ from, to }) => indices[from] === undefined || indices[to] === undefined)) return;
    indices[i] = remaining.length;
    remaining.push(renumber(line, (index) => indices[index]));
  });
  return withDepths(remaining);
}

export function coalesceProof(lines: ProofLine[], ids: string[]) {
  const selected = new Set(ids);
  const remaining: ProofLine[] = [];
  const indices: number[] = [];
  const contexts: number[][] = [];
  const formulas: Formula[] = [];
  const scope: number[] = [];
  lines.forEach((line, i) => {
    if (line.kind === "assumption") scope.push(i);
    if (isDischarge(line)) scope.pop();
    const formula = parseFormula(line.text);
    const isBoundary = line.kind === "assumption" || isDischarge(line)
      || lines.slice(i + 1).some((row) => isDischarge(row) && parseRefs(row.refs).some(({ to }) => to === i));
    const match = selected.has(line.id) && !isBoundary
      ? formulas.findIndex((old, j) => strictEqual(old, formula) && contexts[j].every((s) => scope.includes(s)))
      : -1;
    if (match >= 0) {
      indices[i] = match;
      return;
    }
    indices[i] = remaining.length;
    contexts.push([...scope]);
    formulas.push(formula);
    remaining.push(renumber(line, (index) => indices[index]));
  });
  return remaining;
}

export function replaceProofExpression(lines: ProofLine[], oldText: string, newText: string) {
  const oldFormula = tryFormula(oldText);
  const newFormula = tryFormula(newText);
  const isSymbol = /^[A-Za-z][A-Za-z0-9_']*$/.test(oldText) && /^[A-Za-z][A-Za-z0-9_']*$/.test(newText);
  if (isSymbol) {
    const rename = (name: string) => name === oldText ? newText : name;
    const functionTerm = (term: Term): Term => typeof term === "string" ? term : {
      ...term, name: rename(term.name), args: term.args.map(functionTerm),
    };
    return lines.map((line) => ({
      ...line,
      text: show(rewrite(replaceTerms(parseFormula(line.text), oldText, newText), (formula) => {
        if (formula.t === "atom") return { ...formula, pred: rename(formula.pred), args: formula.args.map(functionTerm) };
        if (formula.t === "eq") return { ...formula, l: functionTerm(formula.l), r: functionTerm(formula.r) };
        return formula;
      })),
    }));
  }
  if (oldFormula && newFormula) {
    return lines.map((line) => ({
      ...line,
      text: show(rewrite(parseFormula(line.text), (f) => strictEqual(f, oldFormula) ? newFormula : f)),
    }));
  }
  const oldTerm = parseTerm(oldText);
  const newTerm = parseTerm(newText);
  return lines.map((line) => ({ ...line, text: show(replaceTerms(parseFormula(line.text), oldTerm, newTerm)) }));
}

function tryFormula(text: string) {
  try { return parseFormula(text); } catch { return null; }
}

function rewrite(formula: Formula, replace: (formula: Formula) => Formula): Formula {
  const replacement = replace(formula);
  if (replacement !== formula) return replacement;
  switch (formula.t) {
    case "all": case "ex": return { ...formula, body: rewrite(formula.body, replace) };
    case "not": return { ...formula, a: rewrite(formula.a, replace) };
    case "and": case "or": case "imp": case "iff":
      return { ...formula, a: rewrite(formula.a, replace), b: rewrite(formula.b, replace) };
    default: return formula;
  }
}
