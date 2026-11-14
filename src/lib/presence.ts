// Live student activity. Each signed-in student's browser keeps presence/{uid}
// up to date (see PresenceTracker); teachers and admins read it on /activity.
// Pure helpers live here so they can be unit tested.

/** How often an open tab rewrites its heartbeat. */
export const HEARTBEAT_MS = 30_000;
/** No input for this long (or a hidden tab) counts as idle. */
export const IDLE_MS = 2 * 60_000;
/** A heartbeat older than this means the tab closed or lost connection (background tabs may only tick once a minute). */
export const OFFLINE_MS = 90_000;
/** Recent events kept on each presence doc. */
export const MAX_EVENTS = 10;

export interface PresenceEvent {
  type: "submit" | "solve";
  problemId: string;
  /** Milliseconds since the epoch. */
  at: number;
}

export interface Presence {
  uid: string;
  name: string;
  email: string;
  path: string;
  problemId: string | null;
  problemTitle: string | null;
  /** When the current problem was opened. */
  problemSince: Date | null;
  lineCount: number | null;
  idle: boolean;
  hidden: boolean;
  heartbeatAt: Date | null;
  events: PresenceEvent[];
}

export type PresenceStatus = "active" | "idle" | "offline";

export function presenceStatus(p: Pick<Presence, "idle" | "hidden" | "heartbeatAt">, now: number): PresenceStatus {
  if (!p.heartbeatAt || now - p.heartbeatAt.getTime() > OFFLINE_MS) return "offline";
  return p.idle || p.hidden ? "idle" : "active";
}

/** Adds an event, newest first, keeping at most MAX_EVENTS. */
export function pushEvent(events: PresenceEvent[], e: PresenceEvent): PresenceEvent[] {
  return [e, ...events].slice(0, MAX_EVENTS);
}

/** "4m 05s", "1h 12m". */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const STATUS_ORDER: Record<PresenceStatus, number> = { active: 0, idle: 1, offline: 2 };

/** Active first, then idle, then offline; most recent heartbeat first within each. */
export function sortPresence(list: Presence[], now: number) {
  return [...list].sort(
    (a, b) =>
      STATUS_ORDER[presenceStatus(a, now)] - STATUS_ORDER[presenceStatus(b, now)] ||
      (b.heartbeatAt?.getTime() ?? 0) - (a.heartbeatAt?.getTime() ?? 0),
  );
}
