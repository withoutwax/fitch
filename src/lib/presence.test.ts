import { describe, expect, it } from "vitest";
import { formatDuration, MAX_EVENTS, OFFLINE_MS, presenceStatus, pushEvent, sortPresence, type Presence } from "./presence";

const now = 1_000_000_000;
const p = (over: Partial<Presence>): Presence => ({
  uid: "u",
  name: "",
  email: "",
  path: "/",
  problemId: null,
  problemTitle: null,
  problemSince: null,
  lineCount: null,
  idle: false,
  hidden: false,
  heartbeatAt: new Date(now),
  events: [],
  ...over,
});

describe("presenceStatus", () => {
  it("is active with a fresh heartbeat", () => expect(presenceStatus(p({}), now)).toBe("active"));
  it("is idle when idle or hidden", () => {
    expect(presenceStatus(p({ idle: true }), now)).toBe("idle");
    expect(presenceStatus(p({ hidden: true }), now)).toBe("idle");
  });
  it("is offline when the heartbeat is stale or missing", () => {
    expect(presenceStatus(p({ heartbeatAt: new Date(now - OFFLINE_MS - 1) }), now)).toBe("offline");
    expect(presenceStatus(p({ heartbeatAt: null }), now)).toBe("offline");
    expect(presenceStatus(p({ heartbeatAt: new Date(now - OFFLINE_MS - 1), idle: true }), now)).toBe("offline");
  });
});

describe("pushEvent", () => {
  it("keeps the newest events first, capped", () => {
    let ev: ReturnType<typeof pushEvent> = [];
    for (let i = 0; i < MAX_EVENTS + 3; i++) ev = pushEvent(ev, { type: "submit", problemId: String(i), at: i });
    expect(ev).toHaveLength(MAX_EVENTS);
    expect(ev[0].problemId).toBe(String(MAX_EVENTS + 2));
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(3_720_000)).toBe("1h 02m");
    expect(formatDuration(-5)).toBe("0m 00s");
  });
});

describe("sortPresence", () => {
  it("orders active, idle, offline", () => {
    const list = [
      p({ uid: "off", heartbeatAt: null }),
      p({ uid: "idle", idle: true }),
      p({ uid: "on" }),
    ];
    expect(sortPresence(list, now).map((x) => x.uid)).toEqual(["on", "idle", "off"]);
  });
});
