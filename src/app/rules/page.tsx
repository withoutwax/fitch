import { RULES } from "@/lib/fitch/rules";

export const metadata = { title: "Rules — Fitch" };

const GROUPS = ["Structural", "Propositional", "Quantifiers", "Identity"] as const;

export default function RulesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Rules of the Fitch system</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Every line after the premises is justified by one of these rules, citing earlier lines (like <code className="font-logic">3</code>) or
        whole subproofs (like <code className="font-logic">4-7</code>). You can only cite lines that are still accessible, meaning they aren&apos;t inside a
        subproof that has already ended.
      </p>
      {GROUPS.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {RULES.filter((r) => r.group === g).map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-baseline gap-3">
                  <span className="font-logic text-lg font-semibold text-accent">{r.label}</span>
                  <span className="text-sm font-medium">{r.name}</span>
                </div>
                <p className="mt-1.5 font-logic text-[13px] leading-relaxed">{r.description}</p>
                <p className="mt-2 text-xs text-muted">Cites {r.cites}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
