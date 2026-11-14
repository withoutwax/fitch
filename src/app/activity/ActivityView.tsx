"use client";

import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/NavBar";
import { Spinner, timeAgo } from "@/components/ui";
import { firebase } from "@/lib/firebase";
import { formatDuration, presenceStatus, sortPresence, type Presence, type PresenceEvent, type PresenceStatus } from "@/lib/presence";

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);

function parse(id: string, v: Record<string, unknown>): Presence {
  return {
    uid: id,
    name: typeof v.name === "string" ? v.name : "",
    email: typeof v.email === "string" ? v.email : "",
    path: typeof v.path === "string" ? v.path : "",
    problemId: typeof v.problemId === "string" ? v.problemId : null,
    problemTitle: typeof v.problemTitle === "string" ? v.problemTitle : null,
    problemSince: toDate(v.problemSince),
    lineCount: typeof v.lineCount === "number" ? v.lineCount : null,
    idle: v.idle === true,
    hidden: v.hidden === true,
    heartbeatAt: toDate(v.heartbeatAt),
    events: Array.isArray(v.events) ? (v.events as PresenceEvent[]) : [],
  };
}

const STATUS_STYLE: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-ok", text: "text-ok" },
  idle: { label: "Idle", dot: "bg-medium", text: "text-medium" },
  offline: { label: "Offline", dot: "bg-muted/50", text: "text-muted" },
};

// Teachers and admins only; firestore.rules refuses everyone else.
export function ActivityView() {
  const { user, role, loading } = useAuth();
  const staff = role === "teacher" || role === "admin";
  const [list, setList] = useState<Presence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Read the clock only in the browser (see the Next.js prerender rules).
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!staff) return;
    return onSnapshot(
      collection(firebase().db, "presence"),
      (snap) => setList(snap.docs.map((d) => parse(d.id, d.data({ serverTimestamps: "estimate" })))),
      (e) => setError(`Could not load activity: ${e.message}`),
    );
  }, [staff]);

  // Re-render so durations and offline status keep moving between snapshots.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const sorted = useMemo(() => (list && now ? sortPresence(list, now) : []), [list, now]);
  const recent = useMemo(
    () =>
      sorted
        .flatMap((p) => p.events.map((e) => ({ ...e, uid: p.uid, who: p.name || p.email || "Student" })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 15),
    [sorted],
  );

  if (loading || (user && role === null)) {
    return (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!staff) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center text-muted">This page is for teachers and admins.</div>;
  }

  const count = (s: PresenceStatus) => sorted.filter((p) => presenceStatus(p, now) === s).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted">What signed-in students are doing right now. Updates live. Select a student to see their profile and every attempt.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["active", "idle", "offline"] as const).map((s) => (
          <div key={s} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />
              {STATUS_STYLE[s].label}
            </div>
            <div className="text-lg font-semibold tabular-nums">{list ? count(s) : "…"}</div>
          </div>
        ))}
      </div>
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          {!list || !now ? (
            <div className="grid h-40 place-items-center text-muted">
              <Spinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Working on</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Lines</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const status = presenceStatus(p, now);
                  const st = STATUS_STYLE[status];
                  return (
                    <tr key={p.uid} className={`${i % 2 ? "bg-surface-2/40" : ""} ${status === "offline" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">
                        <Link href={`/activity/student?id=${encodeURIComponent(p.uid)}`} className="group flex items-center gap-3" title="View this student's profile and attempts">
                          <Avatar name={p.name || p.email || "?"} />
                          <div className="min-w-0">
                            <div className="truncate font-medium group-hover:text-accent group-hover:underline">{p.name || "—"}</div>
                            <div className="truncate text-xs text-muted">{p.email}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 ${st.text}`}>
                          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                        {status !== "active" && (
                          <div className="text-xs text-muted">
                            {status === "offline" ? `seen ${timeAgo(p.heartbeatAt)}` : p.hidden ? "tab in background" : "no input for 2+ min"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {status === "offline" ? (
                          <span className="text-muted">—</span>
                        ) : p.problemId ? (
                          <>
                            <Link href={`/problems/${p.problemId}`} className="font-medium hover:underline">
                              {p.problemTitle ?? p.problemId}
                            </Link>
                            {p.problemSince && <div className="text-xs text-muted tabular-nums">for {formatDuration(now - p.problemSince.getTime())}</div>}
                          </>
                        ) : (
                          <span className="text-muted">{p.path || "—"}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                        {status !== "offline" && p.problemId && p.lineCount !== null ? p.lineCount : "—"}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted">
                      No student activity yet. Students appear here once they sign in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-xs font-medium text-muted">Recent submissions</h2>
          <ul className="divide-y divide-line text-sm">
            {recent.map((e, i) => (
              <li key={`${e.who}-${e.at}-${i}`} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/activity/student?id=${encodeURIComponent(e.uid)}`} className="truncate font-medium hover:text-accent hover:underline">
                    {e.who}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(new Date(e.at))}</span>
                </div>
                <div className="text-xs">
                  <span className={e.type === "solve" ? "text-ok" : "text-bad"}>{e.type === "solve" ? "Solved" : "Submitted (not yet correct)"}</span>{" "}
                  <Link href={`/problems/${e.problemId}`} className="text-muted hover:underline">
                    {e.problemId}
                  </Link>
                </div>
              </li>
            ))}
            {recent.length === 0 && <li className="px-4 py-6 text-center text-muted">Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
