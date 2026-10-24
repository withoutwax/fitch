import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import type { ProofLine } from "./fitch/checker";
import { firebase } from "./firebase";

// Firestore layout:
//   users/{uid}                          profile
//   users/{uid}/progress/{problemId}     one summary per problem
//   users/{uid}/submissions/{autoId}     every submission, for history and the activity calendar

export interface Progress {
  problemId: string;
  solved: boolean;
  attempts: number;
  firstSolvedAt: Date | null;
  lastSolvedAt: Date | null;
  lastAttemptAt: Date | null;
  proof?: ProofLine[];
}

export interface Submission {
  id: string;
  problemId: string;
  solved: boolean;
  lineCount: number;
  at: Date | null;
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);

export async function ensureProfile(user: User) {
  const { db } = firebase();
  await setDoc(
    doc(db, "users", user.uid),
    { displayName: user.displayName ?? null, email: user.email ?? null, lastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function recordSubmission(uid: string, problemId: string, solved: boolean, proof: ProofLine[]) {
  const { db } = firebase();
  const ref = doc(db, "users", uid, "progress", problemId);
  await runTransaction(db, async (tx) => {
    const prev = (await tx.get(ref)).data();
    const now = serverTimestamp();
    tx.set(ref, {
      problemId,
      attempts: (prev?.attempts ?? 0) + 1,
      solved: Boolean(prev?.solved) || solved,
      lastAttemptAt: now,
      firstSolvedAt: prev?.firstSolvedAt ?? (solved ? now : null),
      lastSolvedAt: solved ? now : (prev?.lastSolvedAt ?? null),
      proof: solved ? proof : (prev?.proof ?? null),
    });
  });
  await addDoc(collection(db, "users", uid, "submissions"), {
    problemId,
    solved,
    lineCount: proof.length,
    at: serverTimestamp(),
  });
}

export async function loadProgress(uid: string): Promise<Record<string, Progress>> {
  const { db } = firebase();
  const snap = await getDocs(collection(db, "users", uid, "progress"));
  const out: Record<string, Progress> = {};
  snap.forEach((d) => {
    const v = d.data();
    out[d.id] = {
      problemId: d.id,
      solved: Boolean(v.solved),
      attempts: v.attempts ?? 0,
      firstSolvedAt: toDate(v.firstSolvedAt),
      lastSolvedAt: toDate(v.lastSolvedAt),
      lastAttemptAt: toDate(v.lastAttemptAt),
      proof: v.proof ?? undefined,
    };
  });
  return out;
}

export async function loadSubmissions(uid: string, max = 200): Promise<Submission[]> {
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, "users", uid, "submissions"), orderBy("at", "desc"), limit(max)));
  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, problemId: v.problemId, solved: Boolean(v.solved), lineCount: v.lineCount ?? 0, at: toDate(v.at) };
  });
}
