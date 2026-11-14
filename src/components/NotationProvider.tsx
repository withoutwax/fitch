"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { display, isNotation, NOTATIONS, type Notation } from "@/lib/fitch/notation";

const KEY = "fitch:notation";

// The choice lives in localStorage, so it survives reloads and applies on every page.
const listeners = new Set<() => void>();
let memory: Notation | null = null;
const subscribe = (fn: () => void) => {
  // Another tab changed it: forget our copy and read storage again.
  const onStorage = () => {
    memory = null;
    fn();
  };
  listeners.add(fn);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
};
const read = (): Notation => {
  try {
    const saved = localStorage.getItem(KEY);
    return isNotation(saved) ? saved : "symbols";
  } catch {
    return "symbols";
  }
};
const write = (n: Notation) => {
  try {
    localStorage.setItem(KEY, n);
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts until reload.
  }
  memory = n;
  listeners.forEach((fn) => fn());
};

interface NotationState {
  notation: Notation;
  setNotation: (n: Notation) => void;
  /** Show standard-symbol text in the student's chosen notation. */
  fmt: (text: string) => string;
}

const NotationContext = createContext<NotationState>({ notation: "symbols", setNotation: () => {}, fmt: (s) => s });

export function NotationProvider({ children }: { children: React.ReactNode }) {
  const notation = useSyncExternalStore(
    subscribe,
    () => memory ?? read(),
    () => "symbols" as Notation,
  );
  const fmt = useCallback((text: string) => display(text, notation), [notation]);
  return <NotationContext.Provider value={{ notation, setNotation: write, fmt }}>{children}</NotationContext.Provider>;
}

export const useNotation = () => useContext(NotationContext);

/** Formula text in the student's notation, for use inside server components. */
export function Logic({ children }: { children: string }) {
  return <>{useNotation().fmt(children)}</>;
}

export function NotationToggle() {
  const { notation, setNotation } = useNotation();
  return (
    <div role="radiogroup" aria-label="Logic notation" className="flex rounded-md border border-line p-0.5 text-xs">
      {NOTATIONS.map((n) => (
        <button
          key={n.id}
          role="radio"
          aria-checked={notation === n.id}
          title={n.title}
          onClick={() => setNotation(n.id)}
          className={`rounded px-2 py-1 whitespace-nowrap transition-colors ${
            notation === n.id ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"
          }`}
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
