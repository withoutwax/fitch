"use client";

import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { hasRequiredConsent } from "@/lib/consent";
import { firebase } from "@/lib/firebase";
import { HEARTBEAT_MS, IDLE_MS, pushEvent, type PresenceEvent } from "@/lib/presence";
import { useAuth } from "./AuthProvider";

// Pages report what the student is doing here; PresenceTracker writes it to presence/{uid}.
interface ProblemInfo {
  id: string;
  title: string;
  since: Date;
  lineCount: number | null;
}

let problem: ProblemInfo | null = null;
let events: PresenceEvent[] = [];
let notify: ((kind: "now" | "edit") => void) | null = null;

export const reportPresence = {
  /** The problem page that is open, or null when it closes. */
  openProblem(id: string, title: string) {
    if (problem?.id !== id) problem = { id, title, since: new Date(), lineCount: null };
    notify?.("now");
  },
  closeProblem(id: string) {
    if (problem?.id === id) problem = null;
  },
  lines(id: string, count: number) {
    if (problem?.id !== id || problem.lineCount === count) return;
    problem.lineCount = count;
    notify?.("edit");
  },
  submitted(id: string, solved: boolean) {
    events = pushEvent(events, { type: solved ? "solve" : "submit", problemId: id, at: Date.now() });
    notify?.("now");
  },
};

const EDIT_THROTTLE_MS = 5_000;

/** Keeps presence/{uid} current for signed-in students who agreed to it. Guests and staff are not tracked. */
export function PresenceTracker() {
  const { user, role, consent } = useAuth();
  const path = usePathname();
  // Only students who opted in to activity sharing (see ConsentGate).
  const uid = role === "student" && consent?.activity && hasRequiredConsent(consent) ? (user?.uid ?? null) : null;
  const name = user?.displayName ?? "";
  const email = user?.email ?? "";

  const pathRef = useRef(path);
  const write = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(firebase().db, "presence", uid);
    let idle = false;
    let lastInput = Date.now();
    let lastWrite = 0;
    let editTimer: ReturnType<typeof setTimeout> | null = null;

    const send = () => {
      lastWrite = Date.now();
      if (editTimer) clearTimeout(editTimer);
      editTimer = null;
      const onProblem = problem && pathRef.current === `/problems/${problem.id}` ? problem : null;
      setDoc(ref, {
        uid,
        name,
        email,
        path: pathRef.current,
        problemId: onProblem?.id ?? null,
        problemTitle: onProblem?.title ?? null,
        problemSince: onProblem ? Timestamp.fromDate(onProblem.since) : null,
        lineCount: onProblem?.lineCount ?? null,
        idle,
        hidden: document.visibilityState === "hidden",
        events,
        heartbeatAt: serverTimestamp(),
      }).catch((e) => console.error("Could not update activity", e));
    };
    write.current = send;

    notify = (kind) => {
      if (kind === "now") return send();
      if (editTimer) return;
      editTimer = setTimeout(send, Math.max(0, EDIT_THROTTLE_MS - (Date.now() - lastWrite)));
    };

    const onInput = () => {
      lastInput = Date.now();
      if (idle) {
        idle = false;
        send();
      }
    };
    const checkIdle = () => {
      if (!idle && Date.now() - lastInput >= IDLE_MS) {
        idle = true;
        send();
      }
    };
    const inputs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    inputs.forEach((t) => window.addEventListener(t, onInput, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState === "visible") lastInput = Date.now();
      idle = false;
      send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const heartbeat = setInterval(send, HEARTBEAT_MS);
    const idleCheck = setInterval(checkIdle, 10_000);
    send();

    return () => {
      inputs.forEach((t) => window.removeEventListener(t, onInput));
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(heartbeat);
      clearInterval(idleCheck);
      if (editTimer) clearTimeout(editTimer);
      notify = null;
      write.current = null;
    };
  }, [uid, name, email]);

  useEffect(() => {
    pathRef.current = path;
    write.current?.();
  }, [path]);

  return null;
}
