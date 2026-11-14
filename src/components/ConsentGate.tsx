"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CONSENT_VERSION, hasRequiredConsent } from "@/lib/consent";
import { firebase } from "@/lib/firebase";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

// Shown to every signed-in user until they accept the current terms and
// privacy consent (new sign-ups, and existing accounts on their next visit).
// Required items are separate checkboxes; activity sharing is optional.
export function ConsentGate() {
  const { user, consent, signOut } = useAuth();
  const path = usePathname();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [age, setAge] = useState(false);
  const [activity, setActivity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for the profile; let people read the documents they are agreeing to.
  if (!user || consent === undefined || hasRequiredConsent(consent)) return null;
  if (path === "/privacy" || path === "/terms") return null;

  const all = terms && privacy && age && activity;
  const setAll = (v: boolean) => [setTerms, setPrivacy, setAge, setActivity].forEach((f) => f(v));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setDoc(
        doc(firebase().db, "users", user.uid),
        { consent: { version: CONSENT_VERSION, terms, privacy, age, activity, at: serverTimestamp() } },
        { merge: true },
      );
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal aria-labelledby="consent-title">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
        <h2 id="consent-title" className="text-lg font-semibold tracking-tight">
          Before you continue
        </h2>
        <p className="mt-1 text-sm text-muted">Please review and agree to the following to use your account.</p>

        <label className="mt-5 flex items-center gap-2 border-b border-line pb-3 text-sm font-medium">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
          Agree to all, including the optional item
        </label>

        <div className="mt-3 space-y-3 text-sm">
          <Item checked={terms} onChange={setTerms} required>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-accent hover:underline">
              Terms of Service
            </Link>
            .
          </Item>
          <Item checked={privacy} onChange={setPrivacy} required>
            I agree to the collection and use of my personal information as described in the{" "}
            <Link href="/privacy" target="_blank" className="text-accent hover:underline">
              Privacy Policy
            </Link>
            : my email and name, and the proofs I submit, to run my account and show my progress, kept until I delete my account.
          </Item>
          <Item checked={age} onChange={setAge} required>
            I am 14 or older, or my parent or guardian has agreed to these terms for me.
          </Item>
          <Item checked={activity} onChange={setActivity}>
            Let my teachers see my{" "}
            <Link href="/privacy#activity" target="_blank" className="text-accent hover:underline">
              live activity
            </Link>{" "}
            (the problem I have open, how long, proof length, idle or offline, recent submissions). You can still use the site if you say no.
          </Item>
        </div>

        <p className="mt-4 text-xs text-muted">You may refuse the required items, but you then can&apos;t use an account. You can still solve problems as a guest.</p>
        {error && <p className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={signOut} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50">
            Don&apos;t agree and sign out
          </button>
          <button
            onClick={save}
            disabled={busy || !terms || !privacy || !age}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            Agree and continue
          </button>
        </div>
      </div>
    </div>
  );
}

function Item({ checked, onChange, required, children }: { checked: boolean; onChange: (v: boolean) => void; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex gap-2 leading-snug">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
      <span>
        <span className={required ? "font-medium text-accent" : "font-medium text-muted"}>{required ? "[Required] " : "[Optional] "}</span>
        {children}
      </span>
    </label>
  );
}
