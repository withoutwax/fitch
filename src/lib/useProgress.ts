"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { loadProgress, type Progress } from "./progress";

/** The signed-in student's per-problem progress, keyed by problem id. */
export function useProgress() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ uid: string | null; progress: Record<string, Progress> } | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (uid ? loadProgress(uid) : Promise.resolve({}))
      .catch((e) => {
        console.error("Could not load progress", e);
        return {};
      })
      .then((progress) => {
        if (!cancelled) setState({ uid, progress });
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, uid]);

  const reload = useCallback(async () => {
    if (uid) setState({ uid, progress: await loadProgress(uid) });
  }, [uid]);

  const fresh = state && state.uid === uid;
  return { progress: fresh ? state.progress : {}, loading: authLoading || !fresh, reload };
}
