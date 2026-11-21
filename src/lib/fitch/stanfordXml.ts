import { parseRefs, type ProofLine } from "./checker";
import { RULE_BY_ID, RULES, type RuleId } from "./rules";

export interface StanfordProof {
  lines: ProofLine[];
  objects: string[];
  functions: string[];
}

export interface StanfordXmlOptions {
  objects?: readonly string[];
  functions?: readonly string[];
  formatSentence?: (text: string) => string;
}

function ruleName(rule: RuleId) {
  return rule === "truthTable" ? "Truth Table" : RULE_BY_ID[rule].name;
}

const ruleIds = new Map(RULES.filter((rule) => rule.id !== "shortcut").map((rule) => [ruleName(rule.id), rule.id]));
const closingRule = (rule: ProofLine["rule"]) => rule === "impI" || rule === "botE";

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const escaping = new Map(Object.entries(entities).map(([name, character]) => [character, `&${name};`]));

function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, (character) => escaping.get(character)!);
}

function decodeXml(text: string) {
  return text.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[\da-fA-F]+);/g, (_, entity: string) => {
    if (entity[0] !== "#") return entities[entity as keyof typeof entities];
    const code = Number(entity[1] === "x" ? `0x${entity.slice(2)}` : entity.slice(1));
    if (code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff ||
        code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff) {
      return String.fromCodePoint(code);
    }
    return invalidXml("Invalid character reference.");
  });
}

function invalidXml(detail: string): never {
  throw new Error(`Invalid Stanford proof XML. ${detail}`);
}

function readAttributes(text: string) {
  const attrs = new Map<string, string>();
  let end = 0;
  for (const match of text.matchAll(/\s+([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1].toLowerCase();
    if (match.index !== end || attrs.has(name)) invalidXml("Invalid attribute.");
    attrs.set(name, decodeXml(match[2] ?? match[3]));
    end = match.index + match[0].length;
  }
  if (text.slice(end).trim()) invalidXml("Invalid attribute.");
  return attrs;
}

// Stanford saves raw & and <=> inside sentences. Read only its proof grammar,
// without creating DOM nodes or expanding any custom entities.
class ProofReader {
  private index = 0;

  constructor(private readonly source: string) {}

  match(pattern: RegExp) {
    const spacing = /(?:[\t\n\r ]+|<!--[\s\S]*?-->)+/y;
    spacing.lastIndex = this.index;
    if (spacing.test(this.source)) this.index = spacing.lastIndex;
    pattern.lastIndex = this.index;
    const match = pattern.exec(this.source);
    if (match) this.index = pattern.lastIndex;
    return match;
  }

  readStep() {
    const opening = this.match(/<step(?=[\s>])([^<>]*)>/iy);
    if (!opening) invalidXml("Expected a proof step.");
    const attributes = readAttributes(opening[1]);
    const fields = new Map<string, string>();
    const antecedents: string[] = [];
    while (!this.match(/<\/step\s*>/iy)) {
      const field = this.match(/<(number|sentence|justification|antecedent)\s*(?:\/>|>([^<]*(?:(?:<=>|<->)[^<]*)*)<\/\1\s*>)/iy);
      if (!field) invalidXml("Expected a step field.");
      const name = field[1].toLowerCase();
      const text = decodeXml(field[2] ?? "");
      if (name === "antecedent") {
        const number = Number(text);
        if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(number) || number < 1) {
          invalidXml("Expected a positive antecedent number.");
        }
        antecedents.push(String(number));
      } else {
        if (fields.has(name)) invalidXml(`Duplicate ${name} field.`);
        fields.set(name, text);
      }
    }
    const sentence = fields.get("sentence");
    const justification = fields.get("justification");
    if (sentence === undefined || justification === undefined) invalidXml("Each step needs a sentence and justification.");
    return { attributes, antecedents, sentence, justification };
  }
}

export function importStanfordXml(xml: string, makeId?: () => string): StanfordProof {
  const reader = new ProofReader(xml.replace(/^\uFEFF/, ""));
  reader.match(/<\?xml\s+[^?]*\?>/y);
  const opening = reader.match(/<proof(?=[\s/>])([^<>]*?)(\/?)>/iy);
  if (!opening) invalidXml("Expected a proof element.");
  const attributes = readAttributes(opening[1]);
  const objects = attributes.get("objects")?.match(/\S+/g) ?? [];
  const functions = attributes.get("functions")?.match(/\S+/g) ?? [];
  const lines: ProofLine[] = [];
  let depth = 0;

  if (!opening[2]) {
    while (!reader.match(/<\/proof\s*>/iy)) {
      const step = reader.readStep();
      const shortcut = step.attributes.get("shortcut") === "true";
      const justification = step.justification.trim();
      let kind: ProofLine["kind"] = "step";
      if (!shortcut && justification === "Premise") kind = "premise";
      if (!shortcut && justification === "Assumption") kind = "assumption";
      let rule: ProofLine["rule"] = "";
      if (shortcut) rule = "shortcut";
      else if (kind === "step" && justification) rule = ruleIds.get(justification) ?? "shortcut";
      if (rule === "induction" && !objects.length && !functions.length) rule = "rationalInduction";

      depth = inferredDepth(depth, kind, rule);
      const explicitDepth = step.attributes.get("depth");
      if (explicitDepth !== undefined) {
        depth = Number(explicitDepth);
        const maxDepth = lines.length + (kind === "assumption" ? 1 : 0);
        if (!/^\d+$/.test(explicitDepth) || depth > maxDepth) invalidXml("Invalid step depth.");
      }

      const refs = step.attributes.get("refs") ?? (closingRule(rule) && step.antecedents.length === 2
        ? step.antecedents.join("-")
        : step.antecedents.join(", "));
      const text = step.attributes.get("source") ?? step.sentence.trim();
      const line: ProofLine = { id: makeId?.() ?? `stanford-${lines.length + 1}`, kind, depth, text, rule, refs };
      if (rule === "shortcut") line.justification = step.justification;
      lines.push(line);
    }
  }
  if (!reader.match(/$/y)) invalidXml("Unexpected content after the proof.");
  return { lines, objects, functions };
}

function inferredDepth(previous: number, kind: ProofLine["kind"], rule: ProofLine["rule"]) {
  if (kind === "assumption") return previous + 1;
  return closingRule(rule) ? Math.max(0, previous - 1) : previous;
}

function antecedentsFor(line: ProofLine) {
  try {
    const refs = parseRefs(line.refs);
    if (refs.some(({ from, to }) => from < 0 || !Number.isSafeInteger(to + 1))) return undefined;
    if (closingRule(line.rule) && refs.length === 1) return [refs[0].from + 1, refs[0].to + 1];
    if (!closingRule(line.rule) && refs.every(({ from, to }) => from === to)) return refs.map(({ from }) => from + 1);
  } catch {
    // Preserve incomplete editor citations in the optional refs attribute.
  }
  return undefined;
}

function justificationFor(line: ProofLine) {
  if (line.kind === "premise") return "Premise";
  if (line.kind === "assumption") return "Assumption";
  if (line.rule === "shortcut") return line.justification ?? "Shortcut";
  return line.rule ? ruleName(line.rule) : "";
}

export function exportStanfordXml(lines: readonly ProofLine[], options: StanfordXmlOptions = {}): string {
  const objects = escapeXml(options.objects?.join(" ") ?? "");
  const functions = escapeXml(options.functions?.join(" ") ?? "");
  const parts = [`<proof objects="${objects}" functions="${functions}">`];
  let depth = 0;
  for (const [index, line] of lines.entries()) {
    const justification = justificationFor(line);
    const name = justification.trim();
    const attrs: string[] = [];
    if (line.depth !== inferredDepth(depth, line.kind, line.rule)) attrs.push(` depth="${line.depth}"`);
    if (line.rule === "shortcut" && (!name || name === "Premise" || name === "Assumption" || ruleIds.has(name))) {
      attrs.push(' shortcut="true"');
    }
    depth = line.depth;
    const antecedents = antecedentsFor(line);
    if (!antecedents && line.refs) attrs.push(` refs="${escapeXml(line.refs)}"`);
    const text = options.formatSentence?.(line.text) ?? line.text;
    // Keep native notation for Stanford and recover the editor spelling on reimport.
    if (text.trim() !== line.text) attrs.push(` source="${escapeXml(line.text)}"`);
    parts.push(
      `  <step${attrs.join("")}>`,
      `    <number>${index + 1}</number>`,
      `    <sentence>${escapeXml(text)}</sentence>`,
      `    <justification>${escapeXml(justification)}</justification>`,
      ...(antecedents ?? []).map((number) => `    <antecedent>${number}</antecedent>`),
      "  </step>",
    );
  }
  parts.push("</proof>", "");
  return parts.join("\n");
}
