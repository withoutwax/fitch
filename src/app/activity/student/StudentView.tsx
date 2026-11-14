"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Card } from "@/app/profile/ProfileView";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/NavBar";
import { ProofEditor } from "@/components/ProofEditor";
import { DifficultyText, formatDate, Spinner, timeAgo } from "@/components/ui";
import { checkProof, type ProofLine } from "@/lib/fitch/checker";
import { parseFormula } from "@/lib/fitch/formula";
import type { Problem } from "@/lib/fitch/problemTypes";
import { loadProgress, loadStudent, loadSubmissions, type Progress, type StudentProfile, type Submission } from "@/lib/progress";
import { ROLE_LABEL } from "@/lib/roles";

/** Enough for a course's worth of attempts; older ones are left out. */
const MAX_SUBMISSIONS = 1000;

type Loaded =
  | { ok: true; student: StudentProfile | null; progress: Record<string, Progress>; subs: Submission[] }
  | { ok: false; error: string };

interface Row {
  problemId: string;
  problem: Problem | undefined;
  progress: Progress | undefined;
  /** Newest first. */
  subs: Submission[];
  attempts: number;
  solved: boolean;
  lastAt: Date | null;
}

// A student's profile as teachers and admins see it: every problem the student
// has attempted and each attempt with the proof as submitted. firestore.rules
// refuses everyone else, and students who haven't agreed to share their history.
export function StudentView({ problems }: { problems: Problem[] }) {
  const uid = useSearchParams().get("id");
  if (!uid) return <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center text-muted">Choose a student from the Activity page.</div>;
  return <StudentProfile key={uid} uid={uid} problems={problems} />;
}

function StudentProfile({ uid, problems }: { uid: string; problems: Problem[] }) {
  const { user, role, loading: authLoading } = useAuth();
  const staff = role === "teacher" || role === "admin";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [openProblems, setOpenProblems] = useState<Set<string>>(new Set());
  const [openProof, setOpenProof] = useState<string | null>(null);

  useEffect(() => {
    if (!staff) return;
    let cancelled = false;
    Promise.all([loadStudent(uid), loadProgress(uid), loadSubmissions(uid, MAX_SUBMISSIONS)]).then(
      ([student, progress, subs]) => {
        if (!cancelled) setLoaded({ ok: true, student, progress, subs });
      },
      (e) => {
        if (cancelled) return;
        const denied = (e as { code?: string })?.code === "permission-denied";
        setLoaded({
          ok: false,
          error: denied
            ? "This student's progress isn't shared yet. It appears once they sign in and agree to the current Privacy Policy."
            : `Could not load this student: ${e instanceof Error ? e.message : e}`,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [staff, uid]);

  const byId = useMemo(() => Object.fromEntries(problems.map((p) => [p.id, p])) as Record<string, Problem>, [problems]);

  const rows = useMemo<Row[]>(() => {
    if (!loaded?.ok) return [];
    const ids = new Set([...Object.keys(loaded.progress), ...loaded.subs.map((s) => s.problemId)]);
    return [...ids]
      .map((problemId) => {
        const progress = loaded.progress[problemId];
        const subs = loaded.subs.filter((s) => s.problemId === problemId);
        return {
          problemId,
          problem: byId[problemId],
          progress,
          subs,
          attempts: Math.max(progress?.attempts ?? 0, subs.length),
          solved: Boolean(progress?.solved) || subs.some((s) => s.solved),
          lastAt: progress?.lastAttemptAt ?? subs[0]?.at ?? null,
        };
      })
      .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));
  }, [loaded, byId]);

  if (authLoading || (user && role === null) || (staff && !loaded)) {
    return (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!staff) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center text-muted">This page is for teachers and admins.</div>;
  }

  const back = (
    <Link href="/activity" className="text-sm text-muted hover:text-text">
      ← Activity
    </Link>
  );

  if (!loaded || !loaded.ok) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        {back}
        <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{loaded?.error}</p>
      </div>
    );
  }

  const { student, subs } = loaded;
  if (!student && rows.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        {back}
        <p className="py-10 text-center text-muted">There is no student with this account.</p>
      </div>
    );
  }

  const name = student?.name || student?.email || "Student";
  const solved = rows.filter((r) => r.solved);
  const assisted = solved.filter((r) => r.progress?.solvedAfterAnswer).length;
  const accepted = subs.filter((s) => s.solved).length;
  const lastSubmission = subs[0]?.at ?? null;

  const toggleProblem = (id: string) =>
    setOpenProblems((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleProof = (id: string) => setOpenProof((prev) => (prev === id ? null : id));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      {back}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="truncate">{name}</span>
            {student && <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">{ROLE_LABEL[student.role]}</span>}
          </h1>
          <p className="text-sm text-muted">
            {student?.email}
            {student?.lastSeenAt && <> · Last signed in {timeAgo(student.lastSeenAt)}</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Solved" value={`${solved.length} / ${problems.length}`} note={assisted ? `${assisted} after viewing the answer` : undefined} />
        <Stat label="Attempted, not solved" value={rows.length - solved.length} />
        <Stat
          label="Submissions"
          value={subs.length}
          note={subs.length ? `${Math.round((accepted / subs.length) * 100)}% accepted` : undefined}
        />
        <Stat label="Last submission" value={lastSubmission ? timeAgo(lastSubmission) : "—"} note={lastSubmission ? formatDate(lastSubmission, true) : undefined} />
      </div>

      <Card title="Activity · last 26 weeks">
        <Calendar subs={subs} />
      </Card>

      <Card title={`Problems attempted (${rows.length})`}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No submissions yet.</p>
        ) : (
          <ul className="-mx-5 -mb-5 divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const open = openProblems.has(r.problemId);
              return (
                <li key={r.problemId}>
                  <button
                    onClick={() => toggleProblem(r.problemId)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-surface-2/50"
                  >
                    <span aria-hidden className={`w-3 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{r.problem ? `${r.problem.number}. ${r.problem.title}` : r.problemId}</span>
                      {r.problem && <DifficultyText d={r.problem.difficulty} className="ml-2 text-xs" />}
                    </span>
                    <span className={`shrink-0 font-medium ${r.solved ? "text-ok" : "text-bad"}`}>{r.solved ? "Solved" : "Not solved"}</span>
                    {r.progress?.solvedAfterAnswer && (
                      <span className="hidden shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted sm:inline">with answer</span>
                    )}
                    <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">
                      {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-xs text-muted sm:inline" title={formatDate(r.lastAt, true)}>
                      {r.lastAt ? timeAgo(r.lastAt) : "—"}
                    </span>
                  </button>
                  {open && <Attempts row={r} openProof={openProof} onToggleProof={toggleProof} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

function Attempts({ row, openProof, onToggleProof }: { row: Row; openProof: string | null; onToggleProof: (id: string) => void }) {
  const { problem, progress, subs } = row;
  const finalId = `final:${row.problemId}`;
  // The accepted proof kept on the progress summary, for solves made before each attempt's proof was saved.
  const showFinal = Boolean(progress?.proof) && !subs.some((s) => s.solved && s.proof);
  const unlisted = row.attempts - subs.length;

  return (
    <div className="bg-surface-2/30 px-5 pt-1 pb-4 pl-11">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {progress?.firstSolvedAt && <span>First solved {formatDate(progress.firstSolvedAt, true)}</span>}
        {progress?.viewedAnswerAt && <span>Viewed the model answer {formatDate(progress.viewedAnswerAt, true)}</span>}
        {problem && (
          <Link href={`/problems/${problem.id}`} className="text-accent hover:underline">
            Open problem
          </Link>
        )}
      </div>

      <ol className="divide-y divide-line rounded-lg border border-line bg-surface">
        {showFinal && progress?.proof && (
          <Attempt
            label="Latest accepted proof"
            solved
            at={progress.lastSolvedAt}
            lineCount={progress.proof.length}
            proof={progress.proof}
            problem={problem}
            open={openProof === finalId}
            onToggle={() => onToggleProof(finalId)}
          />
        )}
        {subs.map((s, i) => (
          <Attempt
            key={s.id}
            label={`Attempt ${subs.length - i + Math.max(0, unlisted)}`}
            solved={s.solved}
            at={s.at}
            lineCount={s.lineCount}
            proof={s.proof}
            problem={problem}
            open={openProof === s.id}
            onToggle={() => onToggleProof(s.id)}
          />
        ))}
        {subs.length === 0 && !showFinal && <li className="px-4 py-3 text-sm text-muted">No attempt details were recorded.</li>}
      </ol>
      {unlisted > 0 && subs.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {unlisted} earlier attempt{unlisted === 1 ? " is" : "s are"} not listed.
        </p>
      )}
    </div>
  );
}

interface AttemptProps {
  label: string;
  solved: boolean;
  at: Date | null;
  lineCount: number;
  proof: ProofLine[] | undefined;
  problem: Problem | undefined;
  open: boolean;
  onToggle: () => void;
}

function Attempt({ label, solved, at, lineCount, proof, problem, open, onToggle }: AttemptProps) {
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <span className="w-40 shrink-0 truncate text-muted">{label}</span>
        <span className={`w-28 shrink-0 font-medium ${solved ? "text-ok" : "text-bad"}`}>{solved ? "Accepted" : "Not accepted"}</span>
        <span className="hidden text-xs text-muted tabular-nums sm:inline">{lineCount} lines</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">{formatDate(at, true)}</span>
        {proof ? (
          <button onClick={onToggle} aria-expanded={open} className="w-24 shrink-0 rounded-md px-2 py-1 text-right text-xs font-medium text-accent hover:bg-surface-2">
            {open ? "Hide proof" : "View proof"}
          </button>
        ) : (
          <span className="w-24 shrink-0 text-right text-xs text-muted" title="Proofs are kept for each attempt made after this feature was added">
            Proof not kept
          </span>
        )}
      </div>
      {open && proof && <SubmittedProof proof={proof} problem={problem} />}
    </li>
  );
}

/** The proof exactly as submitted, re-checked so each line shows its mark and error. */
function SubmittedProof({ proof, problem }: { proof: ProofLine[]; problem: Problem | undefined }) {
  const check = useMemo(() => {
    try {
      return checkProof(proof, problem ? parseFormula(problem.goal) : undefined);
    } catch {
      return null;
    }
  }, [proof, problem]);
  const results = check?.lines ?? proof.map(() => ({ ok: true }));

  return (
    <div className="border-t border-line">
      <ProofEditor lines={proof} results={results} onChange={() => {}} readOnly />
      {check && !check.solved && <p className="px-4 pb-3 text-xs text-bad">{check.message}</p>}
    </div>
  );
}
