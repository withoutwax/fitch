import Link from "next/link";
import { PROBLEMS } from "@/lib/fitch/problems";

// Modus tollens, drawn as a static Fitch proof.
const SAMPLE: { n: number; depth: number; text: string; why: string; bar?: boolean }[] = [
  { n: 1, depth: 0, text: "P → Q", why: "Premise" },
  { n: 2, depth: 0, text: "¬Q", why: "Premise", bar: true },
  { n: 3, depth: 1, text: "P", why: "Assume", bar: true },
  { n: 4, depth: 1, text: "Q", why: "→E 1, 3" },
  { n: 5, depth: 1, text: "⊥", why: "⊥I 4, 2" },
  { n: 6, depth: 0, text: "¬P", why: "¬I 3-5" },
];

export default function Home() {
  const count = (d: string) => PROBLEMS.filter((p) => p.difficulty === d).length;
  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-16 md:grid-cols-2">
      <div>
        <p className="text-sm font-medium text-accent">Natural deduction practice</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Learn to prove things, one line at a time.</h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
          Work through {PROBLEMS.length} Fitch-style proofs, from conjunction swaps to quantifier puzzles. Every line is checked as you type, and every
          proof you solve is saved to your profile.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/problems" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
            Start solving
          </Link>
          <Link href="/rules" className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-2">
            Read the rules
          </Link>
        </div>
        <div className="mt-10 flex gap-8 text-sm">
          <div>
            <div className="text-2xl font-semibold text-easy">{count("Easy")}</div>
            <div className="text-muted">Easy</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-medium">{count("Medium")}</div>
            <div className="text-muted">Medium</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-hard">{count("Hard")}</div>
            <div className="text-muted">Hard</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between text-xs text-muted">
          <span className="font-medium tracking-wide uppercase">Modus Tollens</span>
          <span className="rounded-full bg-ok-soft px-2 py-0.5 font-medium text-ok">Accepted</span>
        </div>
        <div className="font-logic text-[15px]">
          {SAMPLE.map((l) => (
            <div key={l.n} className="flex h-9 items-stretch">
              <span className="w-6 self-center text-xs text-muted">{l.n}</span>
              <div className="relative flex-1">
                {Array.from({ length: l.depth + 1 }, (_, k) => (
                  <span key={k} className="absolute bottom-0 w-px bg-text/70" style={{ left: 6 + k * 18, top: k === l.depth && l.why === "Assume" ? 5 : 0 }} />
                ))}
                {l.bar && <span className="absolute bottom-1.5 h-px w-20 bg-text/70" style={{ left: 6 + l.depth * 18 }} />}
                <span className="absolute inset-y-0 flex items-center" style={{ left: 16 + l.depth * 18 }}>
                  {l.text}
                </span>
              </div>
              <span className="w-24 self-center text-sm text-muted">{l.why}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
