"use client";

import { useEffect, useRef, useState } from "react";
import { deleteLines, lastDepth, needsSubproof, newId, runAction, withoutBlanks, type Action, type Prompt } from "@/lib/fitch/apply";
import type { LineResult, ProofLine } from "@/lib/fitch/checker";
import { prettify } from "@/lib/fitch/formula";
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

// Laid out like the button panel of Stanford's Fitch tool, one column at a time.
const RULE_COLUMNS: (RuleId | "assume")[][] = [
  ["notI", "notE", "andI", "andE", "orI", "orE"],
  ["reit", "assume", "impI", "impE", "iffI", "iffE"],
  ["allI", "allE", "exI", "exE"],
  ["botI", "botE", "eqI", "eqE"],
];

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
  const [checked, setChecked] = useState<string[]>([]);
  const [past, setPast] = useState<ProofLine[][]>([]);
  const [future, setFuture] = useState<ProofLine[][]>([]);
  // Consecutive typing in one line undoes as a single step.
  const typingIn = useRef<string | null>(null);
  const [pending, setPending] = useState<{ action: Action; prompt: Prompt } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const premiseCount = lines.filter((l) => l.kind === "premise").length;
  const hasSubproof = lines.some((l) => l.kind === "assumption");
  const allChecked = lines.length > 0 && lines.every((l) => checked.includes(l.id));

  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  /** Change the proof, recording the current one for Undo. */
  const commit = (next: ProofLine[]) => {
    setPast([...past, lines]);
    setFuture([]);
    typingIn.current = null;
    setChecked([]);
    setPending(null);
    setNotice(null);
    onChange(next);
  };

  const restore = (from: ProofLine[][], to: ProofLine[][], setFrom: (s: ProofLine[][]) => void, setTo: (s: ProofLine[][]) => void) => {
    const snap = from[from.length - 1];
    if (!snap) return;
    setFrom(from.slice(0, -1));
    setTo([...to, lines]);
    typingIn.current = null;
    setChecked([]);
    setPending(null);
    setNotice(null);
    onChange(snap);
  };

  const run = (action: Action, input?: string) => {
    // The next line goes where the last row sits, and an empty row gives way to it.
    const filled = withoutBlanks(lines);
    const level = Math.min(lastDepth(lines), lastDepth(filled));
    const out = runAction(action, { lines: filled, checked, level, input });
    if (out.kind === "error") setNotice(out.error);
    else if (out.kind === "prompt") {
      setNotice(null);
      setPending({ action, prompt: out.prompt });
    } else commit(out.lines);
  };

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

  const update = (i: number, patch: Partial<ProofLine>) => {
    if (typingIn.current !== lines[i].id) {
      setPast([...past, lines]);
      setFuture([]);
      typingIn.current = lines[i].id;
    }
    onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  };

  const insertAfter = (i: number, kind: "step" | "assumption", depth: number) => {
    const line: ProofLine = { id: newId(), depth: Math.max(0, depth), kind, text: "", rule: "", refs: "" };
    const next = [...lines];
    next.splice(i + 1, 0, line);
    commit(next);
    setPendingFocus({ id: line.id });
  };

  const addLine = (i: number) => insertAfter(i, "step", lines[i]?.depth ?? 0);
  const openSubproof = (i: number) => insertAfter(i, "assumption", (lines[i]?.depth ?? 0) + 1);
  const closeSubproof = (i: number) => {
    if ((lines[i]?.depth ?? 0) > 0) insertAfter(i, "step", lines[i].depth - 1);
  };
  const removeLine = (i: number) => {
    if (lines[i]?.kind === "premise") return;
    const next = deleteLines(lines, [lines[i].id]).lines;
    commit(next);
    const prev = next[Math.max(0, i - 1)];
    if (prev) setPendingFocus({ id: prev.id });
  };
  /** Delete line acts on the ticked lines if there are any, otherwise on the current one. */
  const removeSelected = () => {
    const ticked = lines.filter((l) => checked.includes(l.id) && l.kind !== "premise").map((l) => l.id);
    if (!ticked.length) return removeLine(target);
    const { lines: next, removed } = deleteLines(lines, ticked);
    commit(next);
    if (removed > ticked.length) setNotice(`Deleted ${removed} lines, including the ones that depended on them.`);
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
            onClick={removeSelected}
            keys="Backspace on an empty line"
            disabled={!checked.some((id) => lines.find((l) => l.id === id)?.kind !== "premise") && (lines[target]?.kind === "premise" || lines.length <= premiseCount + 1)}
          >
            Delete line
          </ToolButton>
          <div className="mx-1 h-5 w-px bg-line" />
          <ToolButton onClick={() => restore(past, future, setPast, setFuture)} keys="Undo the last change" disabled={!past.length}>
            Undo
          </ToolButton>
          <ToolButton onClick={() => restore(future, past, setFuture, setPast)} keys="Redo" disabled={!future.length}>
            Redo
          </ToolButton>
          <ToolButton onClick={() => setShowHelp(!showHelp)} keys="How the rule buttons work">
            {showHelp ? "Hide help" : "Help"}
          </ToolButton>
        </div>
      )}

      {!readOnly && showHelp && (
        <p className="border-b border-line px-4 py-3 text-xs leading-relaxed text-muted">
          You can type a line yourself, or tick the lines a rule uses and click its button to have the line added for you. And Introduction joins lines in
          the order you ticked them. Rules that finish a subproof use the one you&apos;re in or the one that just ended; to use an earlier one, tick any line
          inside it.
        </p>
      )}

      <div className="overflow-x-auto px-2 py-3">
        <div className="min-w-[560px]">
          {!readOnly && (
            <label className="flex h-8 cursor-pointer items-center text-xs text-muted">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => setChecked(allChecked ? [] : lines.map((l) => l.id))}
                aria-label="Select all lines"
                className="mx-1.5 accent-(--accent)"
              />
              <span className="ml-8 pl-2">Select All</span>
            </label>
          )}
          {premiseCount === 0 && (
            <div className={`relative h-3 ${readOnly ? "ml-8" : "ml-14"}`}>
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
              checked={checked.includes(line.id)}
              onToggle={() => toggle(line.id)}
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

      {pending && (
        <PromptPanel
          key={pending.action}
          prompt={pending.prompt}
          onSubmit={(value) => run(pending.action, value)}
          onCancel={() => {
            setPending(null);
            setNotice(null);
          }}
        />
      )}

      {notice && (
        <p role="alert" className="border-t border-line bg-bad-soft px-4 py-2 text-sm text-bad">
          {notice}
        </p>
      )}

      {!readOnly && (
        <div className="grid grid-cols-2 gap-x-1.5 gap-y-1 border-t border-line bg-surface-2/60 p-3 sm:grid-cols-4">
          {RULE_COLUMNS.map((column, k) => (
            <div key={k} className="flex flex-col gap-1">
              {column.map((id) =>
                id === "assume" ? (
                  <RuleButton key={id} onClick={() => run(id)} title="Open a subproof with a new assumption.">
                    Assumption
                  </RuleButton>
                ) : (
                  <RuleButton
                    key={id}
                    onClick={() => run(id)}
                    disabled={needsSubproof(id) && !hasSubproof}
                    title={`${RULE_BY_ID[id].description} Uses ${RULE_BY_ID[id].cites}.`}
                  >
                    {RULE_BY_ID[id].name}
                  </RuleButton>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptPanel({ prompt, onSubmit, onCancel }: { prompt: Prompt; onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(prompt.initial);
  const input = useRef<HTMLInputElement>(null);

  const insert = (sym: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + sym + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + sym.length, start + sym.length);
    });
  };

  return (
    <form
      className="space-y-2 border-t border-line bg-accent-soft/50 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <div>
        <div className="text-sm font-semibold">{prompt.title}</div>
        <p className="text-xs text-muted">{prompt.help}</p>
      </div>
      <input
        ref={input}
        autoFocus
        value={value}
        onChange={(e) => setValue(prompt.term ? e.target.value : prettify(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        spellCheck={false}
        autoComplete="off"
        aria-label={prompt.title}
        placeholder={prompt.placeholder}
        className="h-9 w-full rounded-md border border-line bg-surface px-2 font-logic text-[15px] outline-none placeholder:text-muted/60 focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-1">
        {!prompt.term &&
          PALETTE.map((p) => (
            <button
              key={p.sym}
              type="button"
              title={p.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.sym)}
              className="grid h-8 w-8 place-items-center rounded-md font-logic text-[15px] text-text hover:bg-surface-2"
            >
              {p.sym}
            </button>
          ))}
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90">
            Add
          </button>
        </div>
      </div>
    </form>
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

function RuleButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-h-9 rounded-md border border-line bg-surface px-1.5 py-1 text-xs leading-tight font-medium text-text hover:border-accent hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-40"
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
  checked: boolean;
  onToggle: () => void;
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

function Row({ index, line, result, focused, checked, onToggle, barBelow, readOnly, inputRef, onFocus, onText, onKey, onRule, onRefs, onRefsEnter }: RowProps) {
  const isStep = line.kind === "step";
  const blank = !line.text.trim() && (!isStep || (!line.rule && !line.refs.trim()));
  const showError = result && !result.ok && !blank;
  const textLeft = BAR_X + line.depth * INDENT + 10;

  return (
    <div className={`group flex h-10 items-stretch rounded-md ${focused || checked ? "bg-accent-soft/60" : ""}`}>
      {!readOnly && (
        <div className="flex w-6 shrink-0 items-center justify-center">
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select line ${index + 1}`} className="accent-(--accent)" />
        </div>
      )}
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
              {!readOnly && <span className="text-[10px] text-muted">▾</span>}
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
