import { cacheLife } from "next/cache";
import { decodeFields, docId, listCollection, type RestDocument } from "./firestoreRest";
import { CATEGORIES, DIFFICULTIES, type Category, type Difficulty, type Problem } from "./fitch/problemTypes";

// Problems live in Firestore at problems/{id} and are read on the server.
// The list is cached for a few minutes, so Firestore is read once per cache
// period rather than per visitor, and edits show up without a deploy.

export function toProblem(d: RestDocument): Problem {
  const f = decodeFields(d.fields);
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  return {
    id: docId(d),
    number: typeof f.number === "number" ? f.number : 0,
    title: str("title"),
    difficulty: DIFFICULTIES.includes(f.difficulty as Difficulty) ? (f.difficulty as Difficulty) : "Medium",
    category: CATEGORIES.includes(f.category as Category) ? (f.category as Category) : "Propositional",
    premises: Array.isArray(f.premises) ? f.premises.filter((p): p is string => typeof p === "string") : [],
    goal: str("goal"),
    description: str("description"),
    hint: str("hint"),
    allowShortcut: f.allowShortcut === true,
  };
}

/** All problems, ordered by number. */
export async function getProblems(): Promise<Problem[]> {
  "use cache";
  cacheLife("minutes");
  const docs = await listCollection("problems");
  return docs.map(toProblem).sort((a, b) => a.number - b.number);
}

export async function getProblem(id: string): Promise<{ problem: Problem; prev: Problem | null; next: Problem | null } | null> {
  const all = await getProblems();
  const i = all.findIndex((p) => p.id === id);
  if (i < 0) return null;
  return { problem: all[i], prev: all[i - 1] ?? null, next: all[i + 1] ?? null };
}
