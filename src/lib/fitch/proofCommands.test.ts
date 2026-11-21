import { describe, expect, it } from "vitest";
import { build } from "../../../seed/solutions";
import { checkProof } from "./checker";
import { coalesceProof, copySelection, deleteProofSelection, pasteProof, replaceProofExpression } from "./proofCommands";

const options = { exactSyntax: true };

describe("Stanford workspace editing", () => {
  it("makes copied conclusions into premises when their justifications were omitted", () => {
    const lines = build([[0, "p ∧ q", "P"], [0, "p", "andE", "1"]]);
    const result = copySelection(lines, [lines[1].id]);
    expect(result.map(({ kind, text, refs }) => [kind, text, refs])).toEqual([["premise", "p", ""]]);
  });

  it("appends pasted lines, shifts references, and keeps existing line order", () => {
    const lines = build([[0, "p", "P"], [0, "p", "reit", "1"]]);
    const incoming = build([[0, "q", "P"], [0, "q", "reit", "1"]]);
    let id = 0;
    const result = pasteProof(lines, incoming, () => `import-${++id}`);
    expect(result.map(({ text, refs }) => [text, refs])).toEqual([["p", ""], ["p", "1"], ["q", ""], ["q", "3"]]);
    expect(checkProof(result, undefined, options).valid).toBe(true);
  });

  it("shifts existing forward-positioned rows when inserting a clipboard proof", () => {
    const lines = build([[0, "p", "P"], [0, "q", "P"], [0, "q", "reit", "2"]]);
    const incoming = build([[0, "r", "P"], [0, "r", "reit", "1"]]);
    let id = 0;
    const result = pasteProof(lines, incoming, () => `import-${++id}`, 1);
    expect(result.map(({ text, refs }) => [text, refs])).toEqual([
      ["p", ""], ["r", ""], ["r", "2"], ["q", ""], ["q", "4"],
    ]);
    expect(checkProof(result, undefined, options).valid).toBe(true);
  });

  it("redirects citations when coalescing an independent duplicate", () => {
    const lines = build([[0, "p", "P"], [0, "p", "reit", "1"], [0, "p ∨ q", "orI", "2"]]);
    const result = coalesceProof(lines, [lines[1].id]);
    expect(result.map(({ text, refs }) => [text, refs])).toEqual([["p", ""], ["p ∨ q", "1"]]);
    expect(checkProof(result, undefined, options).valid).toBe(true);
  });

  it("deletes cited descendants while keeping independent rows", () => {
    const lines = build([[0, "p", "P"], [0, "q", "P"], [0, "p", "reit", "1"], [0, "q", "reit", "2"]]);
    const result = deleteProofSelection(lines, [lines[0].id]);
    expect(result.map(({ text, refs }) => [text, refs])).toEqual([["q", ""], ["q", "1"]]);
  });

  it("replaces names in terms and predicate positions", () => {
    const lines = build([[0, "p(p)", "P"], [0, "p(p)", "reit", "1"]]);
    const result = replaceProofExpression(lines, "p", "q");
    expect(result.map(({ text }) => text)).toEqual(["q(q)", "q(q)"]);
    expect(checkProof(result, undefined, options).valid).toBe(true);
  });

  it("replaces function symbols while retaining their arguments and notation", () => {
    const lines = build([[0, "p(f[a])", "P"], [0, "f(a) = a", "P"]]);
    const result = replaceProofExpression(lines, "f", "g");
    expect(result.map(({ text }) => text)).toEqual(["p(g[a])", "g(a) = a"]);
  });

});
