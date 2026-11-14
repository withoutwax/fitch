"use client";

import { collection, doc, getDocs, Timestamp, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/NavBar";
import { Spinner, timeAgo } from "@/components/ui";
import { loadBugReports, setBugReportStatus, type BugReport } from "@/lib/bugReports";
import { firebase } from "@/lib/firebase";
import { parseRole, ROLE_LABEL, ROLES, type Role } from "@/lib/roles";

interface Account {
  uid: string;
  name: string;
  email: string;
  role: Role;
  lastSeenAt: Date | null;
}

// Admins only. The Firestore rules enforce this too: only admins can list
// profiles, and they can change other users' roles but nothing else.
export function AdminView({ problemIds }: { problemIds: string[] }) {
  const { user, role, loading } = useAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [withSolution, setWithSolution] = useState<Set<string> | null>(null);
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    const { db } = firebase();
    getDocs(collection(db, "users")).then(
      (snap) =>
        setAccounts(
          snap.docs
            .map((d) => {
              const v = d.data({ serverTimestamps: "estimate" });
              return {
                uid: d.id,
                name: v.displayName || "",
                email: v.email || "",
                role: parseRole(v.role),
                lastSeenAt: v.lastSeenAt instanceof Timestamp ? v.lastSeenAt.toDate() : null,
              };
            })
            .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0)),
        ),
      (e) => setError(`Could not load users: ${e.message}`),
    );
    getDocs(collection(db, "solutions")).then(
      (snap) => setWithSolution(new Set(snap.docs.map((d) => d.id))),
      (e) => setError(`Could not load solutions: ${e.message}`),
    );
    loadBugReports().then(setReports, (e) => setError(`Could not load bug reports: ${e.message}`));
  }, [isAdmin]);

  const shown = useMemo(
    () => accounts?.filter((a) => !q || `${a.name} ${a.email}`.toLowerCase().includes(q.toLowerCase())) ?? [],
    [accounts, q],
  );

  const changeRole = async (uid: string, next: Role) => {
    setSaving(uid);
    setError(null);
    try {
      await updateDoc(doc(firebase().db, "users", uid), { role: next });
      setAccounts((list) => list?.map((a) => (a.uid === uid ? { ...a, role: next } : a)) ?? null);
    } catch (e) {
      setError(`Could not change the role: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(null);
    }
  };

  const changeStatus = async (id: string, next: BugReport["status"]) => {
    setSaving(id);
    setError(null);
    try {
      await setBugReportStatus(id, next);
      setReports((list) => list?.map((r) => (r.id === id ? { ...r, status: next } : r)) ?? null);
    } catch (e) {
      setError(`Could not update the report: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(null);
    }
  };

  if (loading || (user && role === null)) {
    return (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!isAdmin) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center text-muted">This page is for admins only.</div>;
  }

  const missing = withSolution ? problemIds.filter((id) => !withSolution.has(id)) : [];
  const openReports = reports?.filter((r) => r.status === "open").length ?? 0;
  const count = (r: Role) => accounts?.filter((a) => a.role === r).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">Choose who is a teacher or an admin. Everyone else is a student.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {ROLES.map((r) => (
          <Stat key={r} label={`${ROLE_LABEL[r]}s`} value={accounts ? String(count(r)) : "…"} />
        ))}
        <Stat
          label="Problems with a solution"
          value={withSolution ? `${problemIds.length - missing.length}/${problemIds.length}` : "…"}
          warn={missing.length > 0}
        />
        <Stat label="Open bug reports" value={reports ? String(openReports) : "…"} warn={openReports > 0} />
      </div>
      {missing.length > 0 && (
        <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">
          No model answer uploaded for: {missing.join(", ")}. Run <code>npm run upload-problems</code>.
        </p>
      )}
      {error && <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent sm:w-72"
        />
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {!accounts ? (
            <div className="grid h-40 place-items-center text-muted">
              <Spinner />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Last seen</th>
                  <th className="w-40 px-4 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a, i) => (
                  <tr key={a.uid} className={i % 2 ? "bg-surface-2/40" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name || a.email || "?"} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{a.name || "—"}</div>
                          <div className="truncate text-xs text-muted">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted sm:table-cell">{a.lastSeenAt ? timeAgo(a.lastSeenAt) : "—"}</td>
                    <td className="px-4 py-3">
                      {a.uid === user?.uid ? (
                        <span className="text-muted" title="You can't change your own role">
                          {ROLE_LABEL[a.role]} (you)
                        </span>
                      ) : (
                        <select
                          value={a.role}
                          disabled={saving === a.uid}
                          onChange={(e) => changeRole(a.uid, e.target.value as Role)}
                          aria-label={`Role for ${a.name || a.email}`}
                          className="h-8 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted">
                      No users match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Bug reports</h2>
          <p className="mt-1 text-sm text-muted">Sent with the &ldquo;Report a bug&rdquo; button on a problem page.</p>
        </div>
        {!reports ? (
          <div className="grid h-24 place-items-center rounded-xl border border-line bg-surface text-muted">
            <Spinner />
          </div>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-muted">No bug reports yet.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className={`rounded-xl border border-line bg-surface p-4 ${r.status === "resolved" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <Link href={`/problems/${r.problemId}`} className="font-medium text-accent hover:underline">
                      {r.problemTitle || r.problemId}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {r.email ?? (r.uid ? "Signed-in user" : "Guest")} · {r.createdAt ? timeAgo(r.createdAt) : "—"}
                      {r.status === "resolved" && " · Resolved"}
                    </div>
                  </div>
                  <button
                    onClick={() => changeStatus(r.id, r.status === "open" ? "resolved" : "open")}
                    disabled={saving === r.id}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
                  >
                    {r.status === "open" ? "Resolve" : "Reopen"}
                  </button>
                </div>
                <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{r.message}</p>
                {r.proof.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-text">
                      Attached proof ({r.proof.length} line{r.proof.length === 1 ? "" : "s"})
                    </summary>
                    <ol className="mt-2 overflow-x-auto rounded-lg bg-surface-2/60 p-3 font-logic leading-6">
                      {r.proof.map((l, i) => (
                        <li key={i} className="flex gap-3 whitespace-nowrap">
                          <span className="w-5 shrink-0 text-right text-muted">{i + 1}</span>
                          <span style={{ paddingLeft: `${(Number(l.depth) || 0) * 1.25}rem` }}>{String(l.text ?? "") || "—"}</span>
                          <span className="ml-auto pl-6 text-muted">
                            {l.kind === "step" ? `${l.rule ?? ""} ${l.refs ?? ""}`.trim() : String(l.kind ?? "")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-bad" : ""}`}>{value}</div>
    </div>
  );
}
