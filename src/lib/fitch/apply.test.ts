import { describe, expect, it } from "vitest";
import { deleteLines, runAction, withoutBlanks, type Action } from "./apply";
import { checkProof, parseAssumption, type ProofLine } from "./checker";
import { equal, instanceTerm, parseFormula, type Formula } from "./formula";
import { PROBLEMS } from "./problems";
import { build, SOLUTIONS, type Row } from "./solutions";

const parseLine = (l: ProofLine) => (l.kind === "assumption" ? parseAssumption(l.text).formula! : parseFormula(l.text));

/** Rebuild a model proof using only what the buttons can do. */
function replay(rows: Row[]): ProofLine[] {
  let lines = build(rows.filter((r) => r[2] === "P"));
  for (const row of rows.filter((r) => r[2] !== "P")) {
    const [depth, text, rule, refs = ""] = row;
    const action: Action = rule === "A" ? "assume" : (rule as Action);
    const checked = refs
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => lines[Number(p.split(/[-–]/)[0]) - 1].id);
    const level = rule === "A" ? depth - 1 : depth;
    let input: string | undefined = undefined;
    const first = runAction(action, { lines, checked, level });
    if (first.kind === "prompt") {
      input = text;
      if (first.prompt.term) {
        if (rule === "eqI") input = (parseFormula(text) as { l: string }).l;
        else {
          const g = parseLine(lines.find((l) => l.id === checked[0])!) as Extract<Formula, { t: "all" | "ex" }>;
          input = (instanceTerm(g.body, g.v, parseFormula(text)) || "a") as string;
        }
      }
    }
    const out = input === undefined ? first : runAction(action, { lines, checked, level, input });
    if (out.kind !== "done") throw new Error(`${text} by ${rule} ${refs}: ${out.kind === "error" ? out.error : "asked again"}`);
    const fresh = out.lines.slice(lines.length);
    if (rule === "A") {
      lines = out.lines;
      continue;
    }
    // And Elimination adds both conjuncts; keep the one this proof uses.
    const keep = fresh.find((l) => equal(parseFormula(l.text), parseFormula(text)));
    if (!keep) throw new Error(`${rule} ${refs} gave ${fresh.map((l) => l.text).join(" / ")}, wanted ${text}`);
    lines = [...lines, keep];
  }
  return lines;
}

describe("every model proof can be built with the buttons", () => {
  for (const p of PROBLEMS) {
    it(`#${p.number} ${p.title}`, () => {
      const res = checkProof(replay(SOLUTIONS[p.id]), parseFormula(p.goal));
      expect(res.message).toBe("Proof complete!");
    });
  }
});

const start = (...premises: string[]) => build(premises.map((t) => [0, t, "P"] as Row));

describe("rule buttons", () => {
  it("And Elimination adds both conjuncts", () => {
    const lines = start("P ∧ Q");
    const out = runAction("andE", { lines, checked: [lines[0].id], level: 0 });
    expect(out.kind === "done" && out.lines.slice(1).map((l) => [l.text, l.refs])).toEqual([["P", "1"], ["Q", "1"]]);
  });

  it("And Introduction keeps the order lines were ticked", () => {
    const lines = start("P", "Q");
    const out = runAction("andI", { lines, checked: [lines[1].id, lines[0].id], level: 0 });
    expect(out.kind === "done" && out.lines[2].text).toBe("Q ∧ P");
  });

  it("Implication Introduction closes the open subproof", () => {
    const a = runAction("assume", { lines: [], checked: [], level: 0, input: "P" });
    if (a.kind !== "done") throw new Error("no assumption");
    const out = runAction("impI", { lines: a.lines, checked: [], level: a.level });
    expect(out.kind === "done" && [out.lines[1].text, out.lines[1].depth, out.lines[1].refs, out.level]).toEqual(["P → P", 0, "1-1", 0]);
  });

  it("refuses a rule that doesn't fit, leaving nothing added", () => {
    const lines = start("P", "Q");
    const out = runAction("impE", { lines, checked: [lines[0].id, lines[1].id], level: 0 });
    expect(out).toEqual({ kind: "error", error: "Those lines aren't an implication and its antecedent." });
  });

  it("won't use a line from a subproof that has ended", () => {
    const lines = build([[1, "P", "A"], [0, "P → P", "impI", "1-1"]]);
    const out = runAction("reit", { lines, checked: [lines[0].id], level: 0 });
    expect(out.kind).toBe("error");
  });

  it("asks before rules that need more, without adding a line", () => {
    const lines = start("P");
    expect(runAction("orI", { lines, checked: [lines[0].id], level: 0 }).kind).toBe("prompt");
    expect(runAction("orI", { lines, checked: [], level: 0 }).kind).toBe("error");
  });

  it("rejects an entered formula the rule can't produce", () => {
    const lines = start("P");
    const out = runAction("orI", { lines, checked: [lines[0].id], level: 0, input: "Q ∨ R" });
    expect(out.kind).toBe("error");
  });
});

describe("deleting lines", () => {
  const proof = () =>
    build([
      [0, "P", "P"],
      [0, "P", "reit", "1"],
      [1, "Q", "A"],
      [1, "P", "reit", "2"],
      [0, "Q → P", "impI", "3-4"],
      [0, "P", "reit", "1"],
      [0, "P ∨ R", "orI", "6"],
    ]);

  it("removes dependents and renumbers citations", () => {
    const lines = proof();
    const { lines: next, removed } = deleteLines(lines, [lines[1].id]);
    expect(removed).toBe(3);
    expect(next.map((l) => l.text)).toEqual(["P", "Q", "P", "P ∨ R"]);
    expect(next[3].refs).toBe("3");
    expect(checkProof(next).valid).toBe(true);
  });

  it("removes a whole subproof with its assumption", () => {
    const lines = proof();
    const { lines: next } = deleteLines(lines, [lines[2].id]);
    expect(next.map((l) => l.text)).toEqual(["P", "P", "P", "P ∨ R"]);
    expect(checkProof(next).valid).toBe(true);
  });

  it("keeps premises", () => {
    const lines = proof();
    expect(deleteLines(lines, [lines[0].id]).removed).toBe(0);
  });

  it("clears blank rows from old drafts", () => {
    const lines = build([[0, "P", "P"], [0, "", "reit"]]);
    expect(withoutBlanks(lines).map((l) => l.text)).toEqual(["P"]);
  });
});
