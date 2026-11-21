import { describe, expect, it } from "vitest";
import type { ProofLine } from "./checker";
import { exportStanfordXml, importStanfordXml } from "./stanfordXml";

describe("importStanfordXml", () => {
  it("reconstructs scopes and citations from native Stanford steps", () => {
    const parsed = importStanfordXml(`<?xml version="1.0"?>
      <proof objects='a b' functions="f  g">
        <step><number>1</number><sentence>p & q <=> r</sentence><justification>Premise</justification></step>
        <step><number>2</number><sentence>p</sentence><justification>Assumption</justification></step>
        <step><number>3</number><sentence>~p</sentence><justification>Assumption</justification></step>
        <step><number>4</number><sentence>false</sentence><justification>False Introduction</justification><antecedent>2</antecedent><antecedent>3</antecedent></step>
        <step><number>5</number><sentence>~~p</sentence><justification>False Elimination</justification><antecedent>3</antecedent><antecedent>4</antecedent></step>
        <step><number>6</number><sentence>p =&gt; ~~p</sentence><justification>Implication Introduction</justification><antecedent>2</antecedent><antecedent>5</antecedent></step>
        <step><number>7</number><sentence>p =&gt; p</sentence><justification>Custom_lemma</justification><antecedent>6</antecedent></step>
      </proof>`);

    expect(parsed).toEqual({
      objects: ["a", "b"],
      functions: ["f", "g"],
      lines: [
        { id: "stanford-1", kind: "premise", depth: 0, text: "p & q <=> r", rule: "", refs: "" },
        { id: "stanford-2", kind: "assumption", depth: 1, text: "p", rule: "", refs: "" },
        { id: "stanford-3", kind: "assumption", depth: 2, text: "~p", rule: "", refs: "" },
        { id: "stanford-4", kind: "step", depth: 2, text: "false", rule: "botI", refs: "2, 3" },
        { id: "stanford-5", kind: "step", depth: 1, text: "~~p", rule: "botE", refs: "3-4" },
        { id: "stanford-6", kind: "step", depth: 0, text: "p => ~~p", rule: "impI", refs: "2-5" },
        { id: "stanford-7", kind: "step", depth: 0, text: "p => p", rule: "shortcut", refs: "6", justification: "Custom_lemma" },
      ],
    });
  });

  it.each([
    ["Truth Table", "truthTable"],
    ["Domain Closure", "domainClosure"],
    ["Induction", "induction"],
    ["Rational Equation", "rationalEquation"],
    ["Rational Induction", "rationalInduction"],
  ])("recognizes Stanford’s %s rule", (name, rule) => {
    const { lines } = importStanfordXml(`<proof objects="a" functions="f"><step><sentence>p</sentence><justification>${name}</justification></step></proof>`, () => "fresh-id");
    expect(lines).toEqual([{ id: "fresh-id", kind: "step", depth: 0, text: "p", rule, refs: "" }]);
  });

  it("interprets a Stanford Induction step without a signature as Rational Induction", () => {
    const { lines } = importStanfordXml('<proof objects="" functions=""><step><sentence>AX:p(X)</sentence><justification>Induction</justification></step></proof>');
    expect(lines[0].rule).toBe("rationalInduction");
  });

  it.each([
    ["a document type", "<!DOCTYPE proof><proof/>"],
    ["an executable element", "<proof><script>alert(1)</script></proof>"],
    ["markup inside a sentence", "<proof><step><sentence><img/></sentence><justification>Premise</justification></step></proof>"],
    ["duplicate sentences", "<proof><step><sentence>p</sentence><sentence>q</sentence><justification>Premise</justification></step></proof>"],
    ["a missing closing tag", "<proof><step><sentence>p</sentence><justification>Premise</justification></proof>"],
    ["a trailing root", "<proof/><proof/>"],
    ["a depth impossible for the number of prior lines", '<proof><step depth="9007199254740991"><sentence>p</sentence><justification>Premise</justification></step></proof>'],
  ])("rejects %s", (_case, xml) => {
    expect(() => importStanfordXml(xml)).toThrow(/Stanford proof XML/);
  });
});

describe("exportStanfordXml", () => {
  it("writes escaped sentences, vocabulary and one-line subproof citations", () => {
    const lines: ProofLine[] = [
      { id: "stanford-1", kind: "assumption", depth: 1, text: "p & q <=> r", rule: "", refs: "" },
      { id: "stanford-2", kind: "step", depth: 0, text: "(p & q <=> r) => (p & q <=> r)", rule: "impI", refs: "1-1" },
    ];

    const xml = exportStanfordXml(lines, { objects: ["a'"], functions: ["f&g"], formatSentence: (text) => text.toUpperCase() });
    expect(xml).toContain("objects=\"a&apos;\" functions=\"f&amp;g\"");
    expect(xml).toContain("<sentence>P &amp; Q &lt;=&gt; R</sentence>");
    expect(xml).toMatch(/<justification>Implication Introduction<\/justification>\s+<antecedent>1<\/antecedent>\s+<antecedent>1<\/antecedent>/);
    expect(importStanfordXml(xml)).toEqual({
      objects: ["a'"],
      functions: ["f&g"],
      lines,
    });
  });

  it("preserves editor scopes that Stanford’s rules do not imply", () => {
    const lines: ProofLine[] = [
      { id: "stanford-1", kind: "premise", depth: 0, text: "p", rule: "", refs: "" },
      { id: "stanford-2", kind: "assumption", depth: 1, text: "q", rule: "", refs: "" },
      { id: "stanford-3", kind: "assumption", depth: 1, text: "r", rule: "", refs: "" },
      { id: "stanford-4", kind: "step", depth: 0, text: "p", rule: "reit", refs: "1" },
    ];

    expect(importStanfordXml(exportStanfordXml(lines)).lines).toEqual(lines);
  });

  it("preserves custom justifications that resemble Stanford rule names", () => {
    const lines: ProofLine[] = [
      { id: "stanford-1", kind: "step", depth: 0, text: "p", rule: "shortcut", refs: "", justification: " Assumption " },
    ];

    expect(importStanfordXml(exportStanfordXml(lines)).lines).toEqual(lines);
  });

  it("preserves a draft citation that does not fit the antecedent format", () => {
    const lines: ProofLine[] = [
      { id: "stanford-1", kind: "step", depth: 0, text: "p", rule: "impI", refs: "1-" },
    ];

    expect(importStanfordXml(exportStanfordXml(lines)).lines).toEqual(lines);
  });
});
