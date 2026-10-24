"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { CheckIcon, DifficultyText, DotIcon } from "@/components/ui";
import { parseFormula, show } from "@/lib/fitch/formula";
import { PROBLEMS, type Category, type Difficulty } from "@/lib/fitch/problems";
import { useProgress } from "@/lib/useProgress";

const DIFFS: Difficulty[] = ["Easy", "Medium", "Hard"];
const CATS: Category[] = ["Propositional", "Quantifiers", "Identity"];
type StatusFilter = "all" | "solved" | "attempted" | "todo";

const sequent = (premises: string[], goal: string) =>
  `${premises.map((p) => show(parseFormula(p))).join(", ")}${premises.length ? " " : ""}⊢ ${show(parseFormula(goal))}`;

export default function ProblemsPage() {
  const { user } = useAuth();
  const { progress } = useProgress();
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState<Difficulty | "all">("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useMemo(
    () =>
      PROBLEMS.filter((p) => {
        const pr = progress[p.id];
        const st = pr?.solved ? "solved" : pr ? "attempted" : "todo";
        return (
          (diff === "all" || p.difficulty === diff) &&
          (cat === "all" || p.category === cat) &&
          (status === "all" || status === st) &&
          (!q || `${p.number} ${p.title}`.toLowerCase().includes(q.toLowerCase()))
        );
      }),
    [progress, q, diff, cat, status],
  );

  const solvedBy = (d: Difficulty) => PROBLEMS.filter((p) => p.difficulty === d && progress[p.id]?.solved).length;
  const totalBy = (d: Difficulty) => PROBLEMS.filter((p) => p.difficulty === d).length;
  const solved = PROBLEMS.filter((p) => progress[p.id]?.solved).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
          <p className="mt-1 text-sm text-muted">Build natural deduction proofs in the Fitch system. Start easy and work up.</p>
        </div>
        <div className="flex items-center gap-5 rounded-xl border border-line bg-surface px-5 py-3">
          <div>
            <div className="text-xs text-muted">Solved</div>
            <div className="text-lg font-semibold tabular-nums">
              {solved}
              <span className="text-sm font-normal text-muted">/{PROBLEMS.length}</span>
            </div>
          </div>
          {DIFFS.map((d) => (
            <div key={d} className="w-20">
              <div className="flex justify-between text-xs">
                <DifficultyText d={d} />
                <span className="text-muted tabular-nums">
                  {solvedBy(d)}/{totalBy(d)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${d === "Easy" ? "bg-easy" : d === "Medium" ? "bg-medium" : "bg-hard"}`}
                  style={{ width: `${(solvedBy(d) / totalBy(d)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search problems"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent sm:w-56"
        />
        <Select value={diff} onChange={(v) => setDiff(v as Difficulty | "all")} options={["all", ...DIFFS]} label="Difficulty" />
        <Select value={cat} onChange={(v) => setCat(v as Category | "all")} options={["all", ...CATS]} label="Topic" />
        {user && (
          <Select
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            options={["all", "solved", "attempted", "todo"]}
            label="Status"
          />
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="w-14 px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Sequent</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Topic</th>
              <th className="w-24 px-4 py-3 font-medium">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const pr = progress[p.id];
              return (
                <tr key={p.id} className={`group ${i % 2 ? "bg-surface-2/40" : ""} hover:bg-accent-soft/50`}>
                  <td className="px-4 py-3">
                    {pr?.solved ? (
                      <span title={pr.solvedAfterAnswer ? "Solved with answer" : "Solved"}>
                        <CheckIcon className={`h-4 w-4 ${pr.solvedAfterAnswer ? "text-muted" : "text-ok"}`} />
                      </span>
                    ) : pr ? (
                      <span title="Attempted">
                        <DotIcon className="h-4 w-4 text-medium" />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/problems/${p.id}`} className="font-medium group-hover:text-accent">
                      {p.number}. {p.title}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 font-logic text-[13px] text-muted md:table-cell">{sequent(p.premises, p.goal)}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">{p.category}</td>
                  <td className="px-4 py-3">
                    <DifficultyText d={p.difficulty} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No problems match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm capitalize outline-none focus:border-accent"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o === "all" ? `${label}: all` : o === "todo" ? "Not started" : o}
        </option>
      ))}
    </select>
  );
}
