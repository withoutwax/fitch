"use client";

import { useEffect, useRef, useState } from "react";
import type { LineResult, ProofLine } from "@/lib/fitch/checker";
import { RULE_BY_ID, RULES, type RuleId } from "@/lib/fitch/rules";
import { CheckIcon } from "./ui";

const INDENT = 18; // px per subproof level
const BAR_X = 6; // x of the outermost proof bar

const PALETTE: { sym: string; title: string }[] = [
  { sym: "¬", title: "Not (~)" },
  { sym: "∧", title: "And (&)" },
  { sym: "∨", title: "Or (|)" },
  { sym: "→", title: "If … then (->)" },
  { sym: "↔", title: "If and only if (<->)" },
  { sym: "⊥", title: "Contradiction (#)" },
  { sym: "∀", title: "For all" },
  { sym: "∃", title: "There exists" },
  { sym: "=", title: "Identity" },
  { sym: "≠", title: "Not identical" },
];

const GROUPS = ["Structural", "Propositional", "Quantifiers", "Identity"] as const;

let idCounter = 0;
export const newId = () => `l${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Turn ASCII shorthands into logic symbols as the student types. */
function liveSymbols(s: string) {
  return s
    .replace(/<->/g, "↔")
    .replace(/->/g, "→")
    .replace(/\/\\/g, "∧")
    .replace(/\\\//g, "∨")
    .replace(/&/g, "∧")
    .replace(/\|/g, "∨")
    .replace(/~/g, "¬")
    .replace(/#/g, "⊥");
}

interface Props {
  lines: ProofLine[];
  results: LineResult[];
  onChange: (lines: ProofLine[]) => void;
  readOnly?: boolean;
}

export function ProofEditor({ lines, results, onChange, readOnly }: Props) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusId, setFocusId] = useState<string | null>(null);
  // Where to put the caret once the next render (with the new lines) lands.
  const pendingFocus = useRef<{ id: string; caret?: number } | null>(null);
  const premiseCount = lines.filter((l) => l.kind === "premise").length;

  const focusLine = (id: string, caret?: number) => {
    const el = inputs.current.get(id);
    if (!el) return;
    el.focus();
    const c = caret ?? el.value.length;
    el.setSelectionRange(c, c);
  };
  const setPendingFocus = (p: { id: string; caret?: number }) => {
    pendingFocus.current = p;
  };

  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    focusLine(p.id, p.caret);
  }, [lines]);

  const focusedIndex = lines.findIndex((l) => l.id === focusId);
  const target = focusedIndex >= 0 ? focusedIndex : lines.length - 1;

  const update = (i: number, patch: Partial<ProofLine>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const insertAfter = (i: number, kind: "step" | "assumption", depth: number) => {
    const line: ProofLine = { id: newId(), depth: Math.max(0, depth), kind, text: "", rule: "", refs: "" };
    const next = [...lines];
    next.splice(i + 1, 0, line);
    onChange(next);
    setPendingFocus({ id: line.id });
  };

  const addLine = (i: number) => insertAfter(i, "step", lines[i]?.depth ?? 0);
  const openSubproof = (i: number) => insertAfter(i, "assumption", (lines[i]?.depth ?? 0) + 1);
  const closeSubproof = (i: number) => {
    if ((lines[i]?.depth ?? 0) > 0) insertAfter(i, "step", lines[i].depth - 1);
  };
  const removeLine = (i: number) => {
    if (lines[i]?.kind === "premise") return;
    const next = lines.filter((_, k) => k !== i);
    onChange(next);
    const prev = next[Math.max(0, i - 1)];
    if (prev) setPendingFocus({ id: prev.id });
  };

  const insertSymbol = (sym: string) => {
    const i = target;
    if (i < 0 || lines[i].kind === "premise") return;
    const el = inputs.current.get(lines[i].id);
    const text = lines[i].text;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    update(i, { text: text.slice(0, start) + sym + text.slice(end) });
    setPendingFocus({ id: lines[i].id, caret: start + sym.length });
  };

  const onFormulaKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter") {
      e.preventDefault();
      if (mod) openSubproof(i);
      else if (e.shiftKey) closeSubproof(i);
      else addLine(i);
    } else if (e.key === "Backspace" && !lines[i].text && lines[i].kind !== "premise" && lines.length > premiseCount + 1) {
      e.preventDefault();
      removeLine(i);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      focusLine(lines[i - 1].id);
    } else if (e.key === "ArrowDown" && i < lines.length - 1) {
      e.preventDefault();
      focusLine(lines[i + 1].id);
    }
  };

  const onFormulaInput = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const before = liveSymbols(el.value.slice(0, caret));
    const text = before + liveSymbols(el.value.slice(caret));
    update(i, { text });
    if (text !== el.value) setPendingFocus({ id: lines[i].id, caret: before.length });
  };

  return (
    <div className="flex flex-col">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
          {PALETTE.map((p) => (
            <button
              key={p.sym}
              title={p.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSymbol(p.sym)}
              className="grid h-8 w-8 place-items-center rounded-md font-logic text-[15px] text-text hover:bg-surface-2"
            >
              {p.sym}
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-line" />
          <ToolButton onClick={() => addLine(target)} keys="Enter">
            + Line
          </ToolButton>
          <ToolButton onClick={() => openSubproof(target)} keys="⌘/Ctrl+Enter">
            + Subproof
          </ToolButton>
          <ToolButton onClick={() => closeSubproof(target)} keys="Shift+Enter" disabled={(lines[target]?.depth ?? 0) === 0}>
            End subproof
          </ToolButton>
          <ToolButton
            onClick={() => removeLine(target)}
            keys="Backspace on an empty line"
            disabled={lines[target]?.kind === "premise" || lines.length <= premiseCount + 1}
          >
            Delete line
          </ToolButton>
        </div>
      )}

      <div className="overflow-x-auto px-2 py-3">
        <div className="min-w-[560px]">
          {premiseCount === 0 && (
            <div className="relative ml-8 h-3">
              <span className="absolute top-0 bottom-0 w-px bg-text/70" style={{ left: BAR_X }} />
              <span className="absolute bottom-1 h-px w-40 bg-text/70" style={{ left: BAR_X }} />
            </div>
          )}
          {lines.map((line, i) => (
            <Row
              key={line.id}
              index={i}
              line={line}
              result={results[i]}
              focused={focusId === line.id}
              barBelow={line.kind === "assumption" || (line.kind === "premise" && i === premiseCount - 1)}
              readOnly={readOnly}
              inputRef={(el) => {
                if (el) inputs.current.set(line.id, el);
                else inputs.current.delete(line.id);
              }}
              onFocus={() => setFocusId(line.id)}
              onText={(e) => onFormulaInput(e, i)}
              onKey={(e) => onFormulaKey(e, i)}
              onRule={(rule) => update(i, { rule })}
              onRefs={(refs) => update(i, { refs })}
              onRefsEnter={() => addLine(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  keys,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  keys: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={keys}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

interface RowProps {
  index: number;
  line: ProofLine;
  result?: LineResult;
  focused: boolean;
  barBelow: boolean;
  readOnly?: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onFocus: () => void;
  onText: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRule: (rule: RuleId | "") => void;
  onRefs: (refs: string) => void;
  onRefsEnter: () => void;
}

function Row({ index, line, result, focused, barBelow, readOnly, inputRef, onFocus, onText, onKey, onRule, onRefs, onRefsEnter }: RowProps) {
  const isStep = line.kind === "step";
  const blank = !line.text.trim() && (!isStep || (!line.rule && !line.refs.trim()));
  const showError = result && !result.ok && !blank;
  const textLeft = BAR_X + line.depth * INDENT + 10;

  return (
    <div className={`group flex h-10 items-stretch rounded-md ${focused ? "bg-accent-soft/60" : ""}`}>
      <div className="w-8 shrink-0 self-center pr-2 text-right font-logic text-xs text-muted tabular-nums">{index + 1}</div>

      <div className="relative min-w-0 flex-1">
        {Array.from({ length: line.depth + 1 }, (_, k) => (
          <span
            key={k}
            className="absolute bottom-0 w-px bg-text/70"
            style={{ left: BAR_X + k * INDENT, top: k === line.depth && line.kind === "assumption" ? 5 : 0 }}
          />
        ))}
        {barBelow && (
          <span
            className="absolute bottom-1.5 h-px bg-text/70"
            style={{
              left: BAR_X + line.depth * INDENT,
              width: `min(calc(${Math.max(8, line.text.length + 3)}ch + 12px), calc(100% - ${BAR_X + line.depth * INDENT}px))`,
            }}
          />
        )}
        <input
          ref={inputRef}
          value={line.text}
          onChange={onText}
          onKeyDown={onKey}
          onFocus={onFocus}
          readOnly={readOnly || line.kind === "premise"}
          spellCheck={false}
          autoComplete="off"
          aria-label={`Line ${index + 1} formula`}
          placeholder={line.kind === "assumption" ? "Assume…  ([c] for a boxed constant)" : "Formula"}
          className="absolute inset-y-0 right-0 bg-transparent pr-2 font-logic text-[15px] outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted/60"
          style={{ left: textLeft, width: `calc(100% - ${textLeft}px)` }}
        />
      </div>

      <div className="flex w-20 shrink-0 items-center">
        {isStep ? (
          // The native select lists full rule names; the overlay shows just the short label once chosen.
          <div className="relative h-8 w-full rounded-md border border-transparent hover:border-line has-[select:focus]:border-accent">
            <span className={`pointer-events-none absolute inset-0 flex items-center justify-between px-2 font-logic text-sm ${line.rule ? "text-text" : "text-muted"}`}>
              {line.rule ? RULE_BY_ID[line.rule].label : <span className="font-sans">Rule…</span>}
              <span className="text-[10px] text-muted">▾</span>
            </span>
          <select
            value={line.rule}
            onChange={(e) => onRule(e.target.value as RuleId | "")}
            onFocus={onFocus}
            disabled={readOnly}
            aria-label={`Line ${index + 1} rule`}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            <option value="">Rule…</option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {RULES.filter((r) => r.group === g).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} {r.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          </div>
        ) : (
          <span className="px-2 text-xs font-medium tracking-wide text-muted uppercase">{line.kind === "premise" ? "Premise" : "Assume"}</span>
        )}
      </div>

      <div className="flex w-24 shrink-0 items-center">
        {isStep && (
          <input
            value={line.refs}
            onChange={(e) => onRefs(e.target.value.replace(/[^\d,\s\-–]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRefsEnter();
              }
            }}
            onFocus={onFocus}
            readOnly={readOnly}
            placeholder="lines"
            aria-label={`Line ${index + 1} citations`}
            className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 font-logic text-sm outline-none placeholder:font-sans placeholder:text-muted/60 hover:border-line focus:border-accent"
          />
        )}
      </div>

      <div className="flex w-7 shrink-0 items-center justify-center" title={showError ? result.error : undefined}>
        {blank ? null : showError ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-bad-soft text-xs font-bold text-bad">!</span>
        ) : (
          <CheckIcon className="h-4 w-4 text-ok" />
        )}
      </div>
    </div>
  );
}
