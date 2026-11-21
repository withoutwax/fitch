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
  | "exE"
  | "truthTable"
  | "shortcut"
  | "domainClosure"
  | "induction"
  | "rationalEquation"
  | "rationalInduction";

export interface RuleInfo {
  id: RuleId;
  label: string;
  name: string;
  cites: string;
  description: string;
  group: "Structural" | "Propositional" | "Quantifiers" | "Identity" | "Advanced";
}

// Rules as in Stanford's Fitch: logic.stanford.edu/logica/homepage/fitch.php
export const RULES: RuleInfo[] = [
  { id: "reit", label: "Reit", name: "Reiteration", group: "Structural", cites: "one line", description: "Repeat a formula from an earlier, accessible line." },
  { id: "andI", label: "∧I", name: "And Introduction", group: "Propositional", cites: "two lines", description: "From P and Q, infer P ∧ Q." },
  { id: "andE", label: "∧E", name: "And Elimination", group: "Propositional", cites: "one line", description: "From P ∧ Q, infer P (or Q)." },
  { id: "orI", label: "∨I", name: "Or Introduction", group: "Propositional", cites: "one line", description: "From P, infer P ∨ Q (or Q ∨ P)." },
  { id: "orE", label: "∨E", name: "Or Elimination", group: "Propositional", cites: "three lines", description: "From P ∨ Q, P → R and Q → R, infer R." },
  { id: "impI", label: "→I", name: "Implication Introduction", group: "Propositional", cites: "one subproof", description: "From a subproof assuming P and ending in Q, infer P → Q." },
  { id: "impE", label: "→E", name: "Implication Elimination", group: "Propositional", cites: "two lines", description: "From P → Q and P, infer Q (modus ponens)." },
  { id: "iffI", label: "↔I", name: "Biconditional Introduction", group: "Propositional", cites: "two lines", description: "From P → Q and Q → P, infer P ↔ Q." },
  { id: "iffE", label: "↔E", name: "Biconditional Elimination", group: "Propositional", cites: "one line", description: "From P ↔ Q, infer P → Q (or Q → P)." },
  { id: "notI", label: "¬I", name: "Negation Introduction", group: "Propositional", cites: "two lines", description: "From P → Q and P → ¬Q, infer ¬P." },
  { id: "notE", label: "¬E", name: "Negation Elimination", group: "Propositional", cites: "one line", description: "From ¬¬P, infer P." },
  { id: "botI", label: "⊥I", name: "False Introduction", group: "Propositional", cites: "two lines", description: "From P and ¬P, infer ⊥." },
  { id: "botE", label: "⊥E", name: "False Elimination", group: "Propositional", cites: "one subproof", description: "From a subproof assuming P and ending in ⊥, infer ¬P." },
  { id: "eqI", label: "=I", name: "Equality Introduction", group: "Identity", cites: "nothing", description: "Infer t = t for a ground term t." },
  { id: "eqE", label: "=E", name: "Equality Elimination", group: "Identity", cites: "two lines", description: "From P(a) and a = b, infer P(b), replacing some occurrences of a with b." },
  { id: "allI", label: "∀I", name: "Universal Introduction", group: "Quantifiers", cites: "one line", description: "From P(c), infer ∀x P(x), replacing every c with x. c must not appear in any premise or open assumption." },
  { id: "allE", label: "∀E", name: "Universal Elimination", group: "Quantifiers", cites: "one line", description: "From ∀x P(x), infer P(c) for any ground term c." },
  { id: "exI", label: "∃I", name: "Existential Introduction", group: "Quantifiers", cites: "one line", description: "From P(c), infer ∃x P(x)." },
  { id: "exE", label: "∃E", name: "Existential Elimination", group: "Quantifiers", cites: "two lines", description: "From ∃x P(x) and ∀x (P(x) → Q), infer Q, where x does not occur free in Q and both quantifiers bind the same variable." },
  { id: "truthTable", label: "TT", name: "Truthtable", group: "Advanced", cites: "selected lines", description: "Infer a propositional conclusion that follows from the selected lines by truth table." },
  { id: "shortcut", label: "Shortcut", name: "Shortcut", group: "Advanced", cites: "selected lines", description: "Insert a conclusion with a written justification when the exercise allows shortcuts." },
  { id: "domainClosure", label: "DC", name: "Domain Closure", group: "Advanced", cites: "one instance per object constant", description: "Generalize from every declared object in a finite vocabulary without function constants." },
  { id: "induction", label: "Ind", name: "Induction", group: "Advanced", cites: "base and constructor cases", description: "Use structural induction over the declared objects and function constants." },
  { id: "rationalEquation", label: "Rat Eq", name: "Rational Equation", group: "Advanced", cites: "no lines", description: "Infer an equation between rational terms equivalent under addition and multiplication." },
  { id: "rationalInduction", label: "Rat Ind", name: "Rational Induction", group: "Advanced", cites: "base and induction cases", description: "Use induction over rational terms when no object or function vocabulary is declared." },
];

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleInfo>;
