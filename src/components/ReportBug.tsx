"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";
import { MAX_MESSAGE, submitBugReport } from "@/lib/bugReports";
import type { ProofLine } from "@/lib/fitch/checker";

/** A "Report a bug" button for one problem. The report carries the proof currently in the editor. */
export function ReportBug({ problemId, problemTitle, lines }: { problemId: string; problemTitle: string; lines: ProofLine[] | null }) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"writing" | "sending" | "sent">("writing");
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    if (step === "sent") setStep("writing");
    setError(null);
    dialog.current?.showModal();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || step !== "writing") return;
    setStep("sending");
    setError(null);
    try {
      await submitBugReport({ problemId, problemTitle, message, lines: lines ?? [], path: window.location.pathname, user });
      setMessage("");
      setStep("sent");
    } catch (e) {
      setError(`Couldn't send your report: ${e instanceof Error ? e.message : e}`);
      setStep("writing");
    }
  };

  return (
    <>
      <button onClick={open} className="text-xs text-muted hover:text-text">
        Report a bug
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="report-bug-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
      >
        {step === "sent" ? (
          <div className="space-y-4 p-5">
            <h2 id="report-bug-title" className="text-base font-semibold">
              Thanks, your report was sent
            </h2>
            <p className="text-sm text-muted">We&apos;ll take a look at {problemTitle}.</p>
            <div className="flex justify-end">
              <button
                onClick={() => dialog.current?.close()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4 p-5">
            <div>
              <h2 id="report-bug-title" className="text-base font-semibold">
                Report a bug
              </h2>
              <p className="mt-1 text-sm text-muted">
                Tell us what&apos;s wrong with {problemTitle}. Your current proof is sent along so we can reproduce it
                {user ? ", together with your email address" : ""}.
              </p>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={5}
              required
              autoFocus
              aria-label="What went wrong?"
              placeholder="What went wrong? For example: my proof is correct but line 4 is marked as an error."
              className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!message.trim() || step === "sending"}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {step === "sending" && <Spinner className="h-3.5 w-3.5" />}
                Send
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
