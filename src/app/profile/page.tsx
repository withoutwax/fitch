"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/NavBar";
import { DifficultyText, formatDate, Spinner, timeAgo } from "@/components/ui";
import { PROBLEM_BY_ID, PROBLEMS, type Difficulty } from "@/lib/fitch/problems";
import { loadSubmissions, type Submission } from "@/lib/progress";
import { useProgress } from "@/lib/useProgress";

const WEEKS = 26;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { progress, loading } = useProgress();
  const [subs, setSubs] = useState<Submission[] | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/profile");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) loadSubmissions(user.uid).then(setSubs, (e) => {
      console.error("Could not load submissions", e);
      setSubs([]);
    });
  }, [user]);

  const solvedList = useMemo(
    () =>
      Object.values(progress)
        .filter((p) => p.solved && PROBLEM_BY_ID[p.problemId])
        .sort((a, b) => (b.firstSolvedAt?.getTime() ?? 0) - (a.firstSolvedAt?.getTime() ?? 0)),
    [progress],
  );

  if (authLoading || !user || loading || !subs) {
    return (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    );
  }

  const name = user.displayName || user.email || "Student";
  const accepted = subs.filter((s) => s.solved).length;
  const solvedBy = (d: Difficulty) => solvedList.filter((p) => PROBLEM_BY_ID[p.problemId].difficulty === d).length;
  const totalBy = (d: Difficulty) => PROBLEMS.filter((p) => p.difficulty === d).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted">
            {user.email}
            {user.metadata.creationTime && <> · Member since {formatDate(new Date(user.metadata.creationTime))}</>}
          </p>
        </div>
        <button onClick={() => signOut().then(() => router.push("/"))} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
          Sign out
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Progress">
          <div className="flex items-center gap-6">
            <Ring value={solvedList.length} total={PROBLEMS.length} />
            <div className="flex-1 space-y-3">
              {(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => (
                <div key={d}>
                  <div className="flex justify-between text-xs">
                    <DifficultyText d={d} />
                    <span className="text-muted tabular-nums">
                      {solvedBy(d)}/{totalBy(d)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${d === "Easy" ? "bg-easy" : d === "Medium" ? "bg-medium" : "bg-hard"}`}
                      style={{ width: `${(solvedBy(d) / totalBy(d)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Submissions</dt>
              <dd className="text-lg font-semibold tabular-nums">{subs.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Acceptance</dt>
              <dd className="text-lg font-semibold tabular-nums">{subs.length ? Math.round((accepted / subs.length) * 100) : 0}%</dd>
            </div>
          </dl>
        </Card>

        <Card title={`Activity · last ${WEEKS} weeks`}>
          <Calendar subs={subs} />
        </Card>
      </div>

      <Card title={`Solved problems (${solvedList.length})`}>
        {solvedList.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 font-medium">Problem</th>
                  <th className="px-5 py-2 font-medium">Difficulty</th>
                  <th className="px-5 py-2 font-medium">First solved</th>
                  <th className="hidden px-5 py-2 font-medium sm:table-cell">Last solved</th>
                  <th className="px-5 py-2 text-right font-medium">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {solvedList.map((p) => {
                  const prob = PROBLEM_BY_ID[p.problemId];
                  return (
                    <tr key={p.problemId} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        <Link href={`/problems/${prob.id}`} className="font-medium hover:text-accent">
                          {prob.number}. {prob.title}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5">
                        <DifficultyText d={prob.difficulty} />
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">{formatDate(p.firstSolvedAt, true)}</td>
                      <td className="hidden px-5 py-2.5 whitespace-nowrap text-muted sm:table-cell">{formatDate(p.lastSolvedAt, true)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{p.attempts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Card>

      <Card title="Recent submissions">
        {subs.length ? (
          <ul className="-mx-5 divide-y divide-line">
            {subs.slice(0, 15).map((s) => {
              const prob = PROBLEM_BY_ID[s.problemId];
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                  <span className={`w-28 shrink-0 font-medium ${s.solved ? "text-ok" : "text-bad"}`}>{s.solved ? "Accepted" : "Not accepted"}</span>
                  <Link href={`/problems/${s.problemId}`} className="min-w-0 flex-1 truncate hover:text-accent">
                    {prob ? `${prob.number}. ${prob.title}` : s.problemId}
                  </Link>
                  <span className="hidden text-xs text-muted sm:inline">{s.lineCount} lines</span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted" title={formatDate(s.at, true)}>
                    {timeAgo(s.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty />
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-sm text-muted">
      Nothing here yet.{" "}
      <Link href="/problems" className="font-medium text-accent hover:underline">
        Solve your first problem
      </Link>
    </p>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(value / total) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted">of {total}</div>
        </div>
      </div>
    </div>
  );
}

function Calendar({ subs }: { subs: Submission[] }) {
  const counts = new Map<string, { all: number; solved: number }>();
  for (const s of subs) {
    if (!s.at) continue;
    const k = dayKey(s.at);
    const c = counts.get(k) ?? { all: 0, solved: 0 };
    c.all++;
    if (s.solved) c.solved++;
    counts.set(k, c);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7);
  const weeks: Date[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(
      Array.from({ length: 7 }, (_, d) => {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        return day;
      }),
    );
  }
  const max = Math.max(1, ...[...counts.values()].map((c) => c.all));
  const activeDays = counts.size;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const c = counts.get(dayKey(day));
                const future = day > today;
                const level = c ? 0.25 + 0.75 * (c.all / max) : 0;
                return (
                  <div
                    key={day.toISOString()}
                    title={future ? undefined : `${formatDate(day)}: ${c ? `${c.all} submission${c.all > 1 ? "s" : ""}, ${c.solved} accepted` : "no submissions"}`}
                    className={`h-3 w-3 rounded-[3px] ${future ? "opacity-0" : ""}`}
                    style={{ background: c ? `color-mix(in srgb, var(--accent) ${Math.round(level * 100)}%, var(--surface-2))` : "var(--surface-2)" }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        {activeDays} active day{activeDays === 1 ? "" : "s"} · {subs.length} submission{subs.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
