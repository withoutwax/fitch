"use client";

import { useId, useMemo, useState } from "react";
import { ProofEditor } from "@/components/ProofEditor";
import { checkProof, type ProofLine } from "@/lib/fitch/checker";
import type { AdvancedVocabulary } from "@/lib/fitch/advancedRules";

const EMPTY_VOCABULARY: AdvancedVocabulary = { objects: [], functions: [] };

export function FitchWorkspace() {
  const [lines, setLines] = useState<ProofLine[]>([]);
  const [vocabulary, setVocabulary] = useState(EMPTY_VOCABULARY);
  const options = useMemo(() => ({ vocabulary, exactSyntax: true, allowShortcut: true, allowAdvanced: true }), [vocabulary]);
  const check = useMemo(() => checkProof(lines, undefined, options), [lines, options]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Proof workspace</h1>
      <p className="mt-1 text-sm text-muted">Build a proof from your own premises or load a Stanford Fitch XML file.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <VocabularyEditor label="Object constants" values={vocabulary.objects}
          onChange={(objects) => setVocabulary((v) => ({ ...v, objects }))} />
        <VocabularyEditor label="Function constants" values={vocabulary.functions}
          onChange={(functions) => setVocabulary((v) => ({ ...v, functions }))} />
      </div>
      <section aria-label="Proof" className="mt-4 rounded-xl border border-line bg-surface">
        <ProofEditor lines={lines} results={check.lines} onChange={setLines} options={options}
          workspace={{ vocabulary, setVocabulary }} />
      </section>
      {lines.length > 0 && <p className={`mt-3 text-sm ${check.valid ? "text-muted" : "text-bad"}`} role="status">{check.message}</p>}
    </div>
  );
}

function VocabularyEditor({ label, values, onChange }: {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
}) {
  const field = useId();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    const names = input.trim().split(/[\s,]+/).filter(Boolean);
    if (!names.length || names.some((name) => !/^[a-z][A-Za-z0-9_']*$/.test(name))) {
      setError("Enter names that begin with a lowercase letter.");
      return;
    }
    onChange([...new Set([...values, ...names])]);
    setInput("");
    setError("");
  };

  return (
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <label htmlFor={field} className="block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input id={field} className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-logic text-sm"
          value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" />
        <button type="submit" className="rounded-md border border-line px-3 text-xs font-medium hover:bg-surface-2">Add</button>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {values.map((value) => (
            <li key={value}>
              <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((name) => name !== value))}
                className="rounded-md bg-surface-2 px-2 py-1 text-xs font-logic">{value} ×</button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
