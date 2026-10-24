"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { newId, ProofEditor } from "@/components/ProofEditor";
import { CheckIcon, DifficultyText, formatDate, Spinner } from "@/components/ui";
import { checkProof, type ProofLine } from "@/lib/fitch/checker";
import { parseFormula, show } from "@/lib/fitch/formula";
import { PROBLEMS, type Problem } from "@/lib/fitch/problems";
import { recordSubmission } from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";

const pretty = (s: string) => show(parseFormula(s));

function startingLines(p: Problem): ProofLine[] {
  const premises: ProofLine[] = p.premises.map((text) => ({ id: newId(), depth: 0, kind: "premise", text: pretty(text), rule: "", refs: "" }));
  // A theorem has no premises, so its proof has to open with an assumption.
  const first: ProofLine = p.premises.length
    ? { id: newId(), depth: 0, kind: "step", text: "", rule: "", refs: "" }
    : { id: newId(), depth: 1, kind: "assumption", text: "", rule: "", refs: "" };
  return [...premises, first];
}

const draftKey = (id: string) => `fitch:draft:${id}`;

function readDraft(id: string): ProofLine[] | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as ProofLine[]) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, lines: ProofLine[] | null) {
  try {
    if (lines) localStorage.setItem(draftKey(id), JSON.stringify(lines));
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Storage may be unavailable (private mode); drafts are a convenience only.
  }
}

export function Solver({ problem }: { problem: Problem }) {
  const router = useRouter();
  const { user } = useAuth();
  const { progress, loading, reload } = useProgress();
  const mine = progress[problem.id];
  const goal = useMemo(() => parseFormula(problem.goal), [problem.goal]);

  const [edited, setLines] = useState<ProofLine[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verdict, setVerdict] = useState<{ solved: boolean; message: string; lineCount: number } | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Until the student edits, show the local draft, else their last accepted proof, else a fresh start.
  const savedProof = mine?.proof;
  const initial = useMemo(
    () => (loading ? null : (readDraft(problem.id) ?? savedProof ?? startingLines(problem))),
    [loading, savedProof, problem],
  );
  const lines = edited ?? initial;

  useEffect(() => {
    if (lines) writeDraft(problem.id, lines);
  }, [lines, problem.id]);

  const check = useMemo(() => (lines ? checkProof(lines, goal) : null), [lines, goal]);

  const onChange = (next: ProofLine[]) => {
    setLines(next);
    setVerdict(null);
  };

  const reset = () => {
    writeDraft(problem.id, null);
    onChange(startingLines(problem));
  };

  const submit = async () => {
    if (!lines || !check) return;
    if (!user) {
      router.push(`/login?next=/problems/${problem.id}`);
      return;
    }
    setSubmitting(true);
    try {
      await recordSubmission(user.uid, problem.id, check.solved, lines);
      setVerdict({ solved: check.solved, message: check.message, lineCount: lines.length });
      await reload();
    } catch (e) {
      setVerdict({ solved: false, message: `Couldn't save your submission: ${e instanceof Error ? e.message : e}`, lineCount: lines.length });
    } finally {
      setSubmitting(false);
    }
  };

  const idx = PROBLEMS.findIndex((p) => p.id === problem.id);
  const prev = PROBLEMS[idx - 1];
  const next = PROBLEMS[idx + 1];

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      {/* ---- statement ---- */}
      <section className="flex flex-col rounded-xl border border-line bg-surface">
        <div className="flex-1 space-y-5 p-5">
          <div>
            <Link href="/problems" className="text-xs text-muted hover:text-text">
              ← All problems
            </Link>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {problem.number}. {problem.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-surface-2 px-2.5 py-1">
                <DifficultyText d={problem.difficulty} />
              </span>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{problem.category}</span>
              {mine?.solved && (
                <span className="flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 font-medium text-ok">
                  <CheckIcon className="h-3.5 w-3.5" /> Solved
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface-2/60 p-4">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Prove</div>
            <div className="font-logic text-[15px] leading-7">
              {problem.premises.length ? (
                problem.premises.map((p, i) => (
                  <div key={i}>
                    <span className="mr-3 text-xs text-muted">{i + 1}</span>
                    {pretty(p)}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted italic">No premises: this is a theorem.</div>
              )}
              <div className="mt-1 border-t border-line pt-1">
                <span className="mr-2 text-accent">⊢</span>
                {pretty(problem.goal)}
              </div>
            </div>
          </div>

          <p className="text-sm leading-relaxed">{problem.description}</p>

          <div>
            <button onClick={() => setShowHint(!showHint)} className="text-sm font-medium text-accent hover:underline">
              {showHint ? "Hide hint" : "Show hint"}
            </button>
            {showHint && <p className="mt-2 rounded-lg bg-accent-soft p-3 text-sm leading-relaxed">{problem.hint}</p>}
          </div>

          <div className="rounded-lg border border-line p-4 text-xs leading-relaxed text-muted">
            <div className="mb-1.5 font-medium text-text">How to write a proof</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                Type formulas with the symbol bar or ASCII: <Kbd>~</Kbd> ¬, <Kbd>&amp;</Kbd> ∧, <Kbd>|</Kbd> ∨, <Kbd>-&gt;</Kbd> →, <Kbd>&lt;-&gt;</Kbd> ↔,{" "}
                <Kbd>#</Kbd> ⊥, <Kbd>Ax</Kbd> ∀x, <Kbd>Ex</Kbd> ∃x.
              </li>
              <li>
                <Kbd>Enter</Kbd> adds a line, <Kbd>⌘/Ctrl+Enter</Kbd> opens a subproof, <Kbd>Shift+Enter</Kbd> ends one.
              </li>
              <li>
                Cite lines like <Kbd>1, 3</Kbd> and subproofs like <Kbd>2-5</Kbd>.
              </li>
              <li>
                For ∀I and ∃E, start the subproof with a boxed constant: <Kbd>[c]</Kbd> or <Kbd>[c] P(c)</Kbd>.
              </li>
            </ul>
            <Link href="/rules" target="_blank" className="mt-2 inline-block font-medium text-accent hover:underline">
              Full rule reference ↗
            </Link>
          </div>

          {user && mine && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Submissions</dt>
                <dd className="font-medium">{mine.attempts}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">First solved</dt>
                <dd className="font-medium">{formatDate(mine.firstSolvedAt)}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
          {prev ? (
            <Link href={`/problems/${prev.id}`} className="text-muted hover:text-text">
              ← {prev.number}. {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/problems/${next.id}`} className="text-right text-muted hover:text-text">
              {next.number}. {next.title} →
            </Link>
          )}
        </div>
      </section>

      {/* ---- editor ---- */}
      <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold">Proof</h2>
          <button onClick={reset} className="text-xs text-muted hover:text-text">
            Reset
          </button>
        </div>

        <div className="flex-1">
          {lines && check ? (
            <ProofEditor lines={lines} results={check.lines} onChange={onChange} />
          ) : (
            <div className="grid h-60 place-items-center text-muted">
              <Spinner />
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line p-4">
          {verdict ? (
            <div className={`rounded-lg p-3 text-sm ${verdict.solved ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
              <div className="font-semibold">{verdict.solved ? "Accepted" : "Not accepted yet"}</div>
              <div className="mt-0.5 opacity-90">
                {verdict.solved ? `Your ${verdict.lineCount}-line proof is correct, and it's saved to your profile.` : verdict.message}
              </div>
            </div>
          ) : (
            check && (
              <p className={`text-sm ${check.solved ? "text-ok" : check.valid ? "text-muted" : "text-bad"}`}>{check.message}</p>
            )
          )}
          <div className="flex items-center justify-end gap-3">
            {!user && <span className="text-xs text-muted">Sign in to save your progress</span>}
            <button
              onClick={submit}
              disabled={submitting || !check}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Spinner className="h-3.5 w-3.5" />}
              Submit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1 py-px font-logic text-[11px] text-text">{children}</kbd>;
}
