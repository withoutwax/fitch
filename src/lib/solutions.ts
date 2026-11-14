import { doc, getDoc } from "firebase/firestore";
import { newId } from "./fitch/apply";
import type { LineKind, ProofLine } from "./fitch/checker";
import type { RuleId } from "./fitch/rules";
import { firebase } from "./firebase";

// Model answers live in Firestore at solutions/{problemId}. The rules let
// only teachers and admins read them.

interface StoredLine {
  depth: number;
  kind: LineKind;
  text: string;
  rule: RuleId | "";
  refs: string;
}

/** The model answer for a problem, or null if none has been uploaded. */
export async function loadSolution(problemId: string): Promise<ProofLine[] | null> {
  const snap = await getDoc(doc(firebase().db, "solutions", problemId));
  const lines = snap.data()?.lines as StoredLine[] | undefined;
  return lines ? lines.map((l) => ({ id: newId(), depth: l.depth, kind: l.kind, text: l.text, rule: l.rule, refs: l.refs ?? "" })) : null;
}
