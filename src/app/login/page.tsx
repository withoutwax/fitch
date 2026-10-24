"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { firebase } from "@/lib/firebase";
import { ensureProfile } from "@/lib/progress";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/problems";
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next === "/login" ? "/problems" : next);
  }, [user, loading, next, router]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : "";
      setError(MESSAGES[code] ?? (e instanceof Error ? e.message : "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { auth } = firebase();
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        await ensureProfile(cred.user);
      }
    });
  };

  const google = () => run(async () => void (await signInWithPopup(firebase().auth, new GoogleAuthProvider())));

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "signin" ? "Sign in to save your proofs and track your progress." : "Track every proof you solve."}
      </p>

      <button
        onClick={google}
        disabled={busy}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        <GoogleIcon /> Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <Field label="Name" value={name} onChange={setName} autoComplete="name" placeholder="Ada Lovelace" />
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={6}
        />
        {error && <p className="rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted">
        By continuing, you agree to the{" "}
        <Link href="/terms" className="underline hover:text-text">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-text">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === "signin" ? "New here? " : "Already have an account? "}
        <button
          className="font-medium text-accent hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function Field({
  label,
  onChange,
  ...props
}: { label: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        {...props}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
