export type RuleId =
  | "reit"
  | "andI"
  | "andE"
  | "orI"
  | "orE"
  | "impI"
  | "impE"
  | "iffI"
  | "iffE"
  | "notI"
  | "notE"
  | "botI"
  | "botE"
  | "eqI"
  | "eqE"
  | "allI"
  | "allE"
  | "exI"
  | "exE";

export interface RuleInfo {
  id: RuleId;
  label: string;
  name: string;
  cites: string;
  description: string;
  group: "Structural" | "Propositional" | "Quantifiers" | "Identity";
}

export const RULES: RuleInfo[] = [
  { id: "reit", label: "Reit", name: "Reiteration", group: "Structural", cites: "one line", description: "Repeat a formula from an earlier, accessible line." },
  { id: "andI", label: "∧I", name: "Conjunction Intro", group: "Propositional", cites: "two lines", description: "From P and Q, infer P ∧ Q." },
  { id: "andE", label: "∧E", name: "Conjunction Elim", group: "Propositional", cites: "one line", description: "From P ∧ Q, infer P (or Q)." },
  { id: "orI", label: "∨I", name: "Disjunction Intro", group: "Propositional", cites: "one line", description: "From P, infer P ∨ Q (or Q ∨ P)." },
  { id: "orE", label: "∨E", name: "Disjunction Elim", group: "Propositional", cites: "one line + one subproof per disjunct", description: "From P ∨ Q, a subproof P … R and a subproof Q … R, infer R." },
  { id: "impI", label: "→I", name: "Conditional Intro", group: "Propositional", cites: "one subproof", description: "From a subproof assuming P and ending in Q, infer P → Q." },
  { id: "impE", label: "→E", name: "Conditional Elim", group: "Propositional", cites: "two lines", description: "From P → Q and P, infer Q (modus ponens)." },
  { id: "iffI", label: "↔I", name: "Biconditional Intro", group: "Propositional", cites: "two subproofs", description: "From subproofs P … Q and Q … P, infer P ↔ Q." },
  { id: "iffE", label: "↔E", name: "Biconditional Elim", group: "Propositional", cites: "two lines", description: "From P ↔ Q and P, infer Q (or from Q, infer P)." },
  { id: "notI", label: "¬I", name: "Negation Intro", group: "Propositional", cites: "one subproof", description: "From a subproof assuming P and ending in ⊥, infer ¬P." },
  { id: "notE", label: "¬E", name: "Negation Elim", group: "Propositional", cites: "one line", description: "From ¬¬P, infer P." },
  { id: "botI", label: "⊥I", name: "Contradiction Intro", group: "Propositional", cites: "two lines", description: "From P and ¬P, infer ⊥." },
  { id: "botE", label: "⊥E", name: "Contradiction Elim", group: "Propositional", cites: "one line", description: "From ⊥, infer any formula." },
  { id: "eqI", label: "=I", name: "Identity Intro", group: "Identity", cites: "nothing", description: "Infer a = a, citing no lines." },
  { id: "eqE", label: "=E", name: "Identity Elim", group: "Identity", cites: "two lines", description: "From P(a) and a = b, infer P(b), replacing some occurrences of a with b." },
  { id: "allI", label: "∀I", name: "Universal Intro", group: "Quantifiers", cites: "one boxed subproof", description: "From a subproof [c] … P(c) where c is new, infer ∀x P(x)." },
  { id: "allE", label: "∀E", name: "Universal Elim", group: "Quantifiers", cites: "one line", description: "From ∀x P(x), infer P(c) for any name c." },
  { id: "exI", label: "∃I", name: "Existential Intro", group: "Quantifiers", cites: "one line", description: "From P(c), infer ∃x P(x)." },
  { id: "exE", label: "∃E", name: "Existential Elim", group: "Quantifiers", cites: "one line + one boxed subproof", description: "From ∃x P(x) and a subproof [c] P(c) … Q where c is new and not in Q, infer Q." },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleInfo>;
