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
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import type { ProofLine } from "./fitch/checker";
import { firebase } from "./firebase";
import { clearLocal, hasLocalData, readLocal, recordLocal } from "./localProgress";

// Signed-in students are stored in Firestore:
//   users/{uid}                          profile
//   users/{uid}/progress/{problemId}     one summary per problem
//   users/{uid}/submissions/{autoId}     every submission, for history and the activity calendar
// Guests (uid null) are stored in this browser instead; see localProgress.ts.

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
const msToDate = (v: number | null) => (v === null ? null : new Date(v));
const msToTs = (v: number | null) => (v === null ? null : Timestamp.fromMillis(v));

export async function ensureProfile(user: User) {
  const { db } = firebase();
  await setDoc(
    doc(db, "users", user.uid),
    { displayName: user.displayName ?? null, email: user.email ?? null, lastSeenAt: serverTimestamp() },
    { merge: true },
  );
}

export async function recordSubmission(uid: string | null, problemId: string, solved: boolean, proof: ProofLine[]) {
  if (!uid) {
    recordLocal(problemId, solved, proof);
    return;
  }
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

export async function loadProgress(uid: string | null): Promise<Record<string, Progress>> {
  const out: Record<string, Progress> = {};
  if (!uid) {
    for (const [id, v] of Object.entries(readLocal().progress)) {
      out[id] = {
        problemId: id,
        solved: v.solved,
        attempts: v.attempts,
        firstSolvedAt: msToDate(v.firstSolvedAt),
        lastSolvedAt: msToDate(v.lastSolvedAt),
        lastAttemptAt: msToDate(v.lastAttemptAt),
        proof: v.proof ?? undefined,
      };
    }
    return out;
  }
  const { db } = firebase();
  const snap = await getDocs(collection(db, "users", uid, "progress"));
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

export async function loadSubmissions(uid: string | null, max = 200): Promise<Submission[]> {
  if (!uid) {
    return readLocal()
      .submissions.slice(0, max)
      .map((s) => ({ ...s, at: new Date(s.at) }));
  }
  const { db } = firebase();
  const snap = await getDocs(query(collection(db, "users", uid, "submissions"), orderBy("at", "desc"), limit(max)));
  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, problemId: v.problemId, solved: Boolean(v.solved), lineCount: v.lineCount ?? 0, at: toDate(v.at) };
  });
}

/**
 * Move progress made as a guest into the signed-in account, merging with what
 * the account already has, then clear it from the browser.
 */
export async function importGuestProgress(uid: string) {
  const local = readLocal();
  if (!hasLocalData(local)) return;
  const { db } = firebase();

  for (const [problemId, g] of Object.entries(local.progress)) {
    const ref = doc(db, "users", uid, "progress", problemId);
    await runTransaction(db, async (tx) => {
      const prev = (await tx.get(ref)).data();
      const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);
      const pick = (a: number | null, b: number | null, f: (...n: number[]) => number) =>
        a === null ? b : b === null ? a : f(a, b);
      const prevLastSolved = ms(prev?.lastSolvedAt);
      const guestSolvedLater = g.lastSolvedAt !== null && (prevLastSolved === null || g.lastSolvedAt > prevLastSolved);
      tx.set(ref, {
        problemId,
        attempts: (prev?.attempts ?? 0) + g.attempts,
        solved: Boolean(prev?.solved) || g.solved,
        lastAttemptAt: msToTs(pick(ms(prev?.lastAttemptAt), g.lastAttemptAt, Math.max)),
        firstSolvedAt: msToTs(pick(ms(prev?.firstSolvedAt), g.firstSolvedAt, Math.min)),
        lastSolvedAt: msToTs(pick(prevLastSolved, g.lastSolvedAt, Math.max)),
        proof: (guestSolvedLater ? g.proof : prev?.proof) ?? g.proof ?? null,
      });
    });
  }

  // Firestore batches hold at most 500 writes.
  for (let i = 0; i < local.submissions.length; i += 450) {
    const batch = writeBatch(db);
    for (const s of local.submissions.slice(i, i + 450)) {
      batch.set(doc(collection(db, "users", uid, "submissions")), {
        problemId: s.problemId,
        solved: s.solved,
        lineCount: s.lineCount,
        at: Timestamp.fromMillis(s.at),
        importedFromBrowser: true,
      });
    }
    await batch.commit();
  }

  clearLocal();
}
