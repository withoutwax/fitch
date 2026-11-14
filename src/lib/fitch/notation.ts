// How connectives are shown to the student. Formulas are always stored and
// checked in the standard symbols (¬ ∧ ∨ → ↔); simplified symbols are a display layer.
//
//   symbols     ¬P ∧ Q → R ↔ S
//   simplified  ~P & Q => R <=> S     (keyboard symbols, as Stanford's Fitch tool prints them)

export type Notation = "symbols" | "simplified";

export const NOTATIONS: { id: Notation; label: string; title: string }[] = [
  { id: "symbols", label: "Standard", title: "Standard logic symbols: ¬ ∧ ∨ → ↔" },
  { id: "simplified", label: "Simplified Symbols", title: "Keyboard symbols: ~ & | => <=>" },
];

export const isNotation = (s: unknown): s is Notation => NOTATIONS.some((n) => n.id === s);

const SIMPLIFIED: Record<string, string> = { "¬": "~", "∧": "&", "∨": "|", "→": "=>", "↔": "<=>" };

/** Show standard-symbol text in the chosen notation. */
export function display(text: string, notation: Notation): string {
  return notation === "simplified" ? text.replace(/[¬∧∨→↔]/g, (c) => SIMPLIFIED[c]) : text;
}

/** Turn what the student sees in `notation` back into the standard symbols. */
export function toSymbols(text: string, notation: Notation): string {
  if (notation !== "simplified") return text;
  return text.replace(/<=>/g, "↔").replace(/=>/g, "→").replace(/&/g, "∧").replace(/\|/g, "∨").replace(/~/g, "¬");
}
