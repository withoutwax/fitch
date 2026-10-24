import type { ProofLine } from "./fitch/checker";

// Progress for students who aren't signed in, kept in this browser's localStorage.
// Timestamps are stored as epoch milliseconds.

export interface LocalProgress {
  solved: boolean;
  attempts: number;
  firstSolvedAt: number | null;
  lastSolvedAt: number | null;
  lastAttemptAt: number | null;
  proof: ProofLine[] | null;
  /** When the student first looked at the model answer. */
  viewedAnswerAt?: number | null;
  /** First solved only after viewing the model answer. */
  solvedAfterAnswer?: boolean;
}

export interface LocalSubmission {
  id: string;
  problemId: string;
  solved: boolean;
  lineCount: number;
  at: number;
}

export interface LocalStore {
  progress: Record<string, LocalProgress>;
  submissions: LocalSubmission[];
}

const KEY = "fitch:guest";
const MAX_SUBMISSIONS = 500;

export function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<LocalStore>;
      return { progress: v.progress ?? {}, submissions: v.submissions ?? [] };
    }
  } catch {
    // Unreadable or blocked storage: behave as if empty.
  }
  return { progress: {}, submissions: [] };
}

function writeLocal(store: LocalStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    throw new Error("This browser won't let the site save data (private mode?). Sign in to keep your progress.");
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasLocalData(store = readLocal()) {
  return store.submissions.length > 0 || Object.keys(store.progress).length > 0;
}

export function recordLocal(problemId: string, solved: boolean, proof: ProofLine[]) {
  const store = readLocal();
  const now = Date.now();
  const prev = store.progress[problemId];
  store.progress[problemId] = {
    viewedAnswerAt: prev?.viewedAnswerAt ?? null,
    solvedAfterAnswer: Boolean(prev?.solvedAfterAnswer) || (solved && !prev?.solved && prev?.viewedAnswerAt != null),
    solved: Boolean(prev?.solved) || solved,
    attempts: (prev?.attempts ?? 0) + 1,
    lastAttemptAt: now,
    firstSolvedAt: prev?.firstSolvedAt ?? (solved ? now : null),
    lastSolvedAt: solved ? now : (prev?.lastSolvedAt ?? null),
    proof: solved ? proof : (prev?.proof ?? null),
  };
  store.submissions.unshift({ id: `local-${now.toString(36)}`, problemId, solved, lineCount: proof.length, at: now });
  store.submissions = store.submissions.slice(0, MAX_SUBMISSIONS);
  writeLocal(store);
}

export function recordLocalAnswerView(problemId: string) {
  const store = readLocal();
  const prev = store.progress[problemId];
  if (prev?.viewedAnswerAt) return;
  store.progress[problemId] = prev
    ? { ...prev, viewedAnswerAt: Date.now() }
    : { solved: false, attempts: 0, firstSolvedAt: null, lastSolvedAt: null, lastAttemptAt: null, proof: null, viewedAnswerAt: Date.now() };
  writeLocal(store);
}
