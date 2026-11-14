import { addDoc, collection, doc, getDocs, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { ProofLine } from "./fitch/checker";
import { firebase } from "./firebase";

// Bug reports sent from a problem page live in Firestore at bugReports/{autoId}.
// Anyone can send one; the rules let only admins read them and change their status.

export const MAX_MESSAGE = 2000;
const MAX_LINES = 200;

export type BugReportLine = Omit<ProofLine, "id">;

export interface BugReport {
  id: string;
  problemId: string;
  problemTitle: string;
  message: string;
  /** The proof in the editor when the report was sent. */
  proof: BugReportLine[];
  path: string;
  /** Null for a guest. */
  uid: string | null;
  email: string | null;
  status: "open" | "resolved";
  createdAt: Date | null;
}

export async function submitBugReport(r: {
  problemId: string;
  problemTitle: string;
  message: string;
  lines: ProofLine[];
  path: string;
  user: User | null;
}) {
  await addDoc(collection(firebase().db, "bugReports"), {
    problemId: r.problemId,
    problemTitle: r.problemTitle.slice(0, 200),
    message: r.message.trim().slice(0, MAX_MESSAGE),
    proof: r.lines.slice(0, MAX_LINES).map(({ depth, kind, text, rule, refs }) => ({ depth, kind, text, rule, refs })),
    path: r.path.slice(0, 200),
    uid: r.user?.uid ?? null,
    email: r.user?.email ?? null,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

/** Every report, open ones first, then newest first. Admins only. */
export async function loadBugReports(): Promise<BugReport[]> {
  const snap = await getDocs(collection(firebase().db, "bugReports"));
  return snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        problemId: String(v.problemId ?? ""),
        problemTitle: String(v.problemTitle ?? ""),
        message: String(v.message ?? ""),
        proof: Array.isArray(v.proof) ? (v.proof as BugReportLine[]) : [],
        path: String(v.path ?? ""),
        uid: typeof v.uid === "string" ? v.uid : null,
        email: typeof v.email === "string" ? v.email : null,
        status: v.status === "resolved" ? ("resolved" as const) : ("open" as const),
        createdAt: v.createdAt instanceof Timestamp ? v.createdAt.toDate() : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.status === "resolved") - Number(b.status === "resolved") || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
    );
}

export async function setBugReportStatus(id: string, status: BugReport["status"]) {
  await updateDoc(doc(firebase().db, "bugReports", id), { status });
}
