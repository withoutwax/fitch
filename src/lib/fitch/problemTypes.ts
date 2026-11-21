export type Difficulty = "Easy" | "Medium" | "Hard";
export type Category = "Propositional" | "Quantifiers" | "Identity";

export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
export const CATEGORIES: Category[] = ["Propositional", "Quantifiers", "Identity"];

/** A problem as stored in Firestore at problems/{id}. */
export interface Problem {
  id: string;
  number: number;
  title: string;
  difficulty: Difficulty;
  category: Category;
  premises: string[];
  goal: string;
  description: string;
  hint: string;
  allowShortcut?: boolean;
}
