import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Runs against the Firestore emulator: npm run test:rules

const BOOTSTRAP = "rlagmlckd@gmail.com";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fitch-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { displayName: "Alice" });
    await setDoc(doc(db, "users/alice/progress/p1"), { solved: true });
    await setDoc(doc(db, "users/tina"), { displayName: "Tina", role: "teacher" });
    await setDoc(doc(db, "users/adam"), { displayName: "Adam", role: "admin" });
    await setDoc(doc(db, "problems/p1"), { number: 1, title: "One" });
    await setDoc(doc(db, "solutions/p1"), { lines: [] });
  });
});

const as = (uid: string, token: Record<string, unknown> = {}) => env.authenticatedContext(uid, token).firestore();
const guest = () => env.unauthenticatedContext().firestore();

describe("profiles and roles", () => {
  it("a new user can create their own profile without a role", async () => {
    await assertSucceeds(setDoc(doc(as("bob"), "users/bob"), { displayName: "Bob" }));
  });

  it("a new user cannot create their profile with a role", async () => {
    await assertFails(setDoc(doc(as("bob"), "users/bob"), { displayName: "Bob", role: "teacher" }));
    await assertFails(setDoc(doc(as("bob"), "users/bob"), { displayName: "Bob", role: "admin" }));
  });

  it("a student cannot add a role to their profile", async () => {
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { role: "admin" }, { merge: true }));
    await assertFails(updateDoc(doc(as("alice"), "users/alice"), { role: "teacher" }));
  });

  it("a student can still update their other profile fields", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), { displayName: "Al" }, { merge: true }));
  });

  it("a teacher cannot promote themselves", async () => {
    await assertFails(updateDoc(doc(as("tina"), "users/tina"), { role: "admin" }));
  });

  it("the bootstrap email can make itself admin only when verified", async () => {
    const verified = as("owner", { email: BOOTSTRAP, email_verified: true });
    const unverified = as("owner", { email: BOOTSTRAP, email_verified: false });
    await assertFails(setDoc(doc(unverified, "users/owner"), { role: "admin" }));
    await assertSucceeds(setDoc(doc(verified, "users/owner"), { role: "admin" }));
  });

  it("the bootstrap email can promote an existing profile", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users/owner"), { displayName: "Owner" }));
    const verified = as("owner", { email: BOOTSTRAP, email_verified: true });
    await assertSucceeds(setDoc(doc(verified, "users/owner"), { role: "admin" }, { merge: true }));
  });

  it("the bootstrap email cannot be used to grant other roles or other users", async () => {
    const verified = as("owner", { email: BOOTSTRAP, email_verified: true });
    await assertFails(setDoc(doc(verified, "users/owner"), { role: "teacher" }));
    await assertFails(updateDoc(doc(verified, "users/alice"), { role: "admin" }));
  });

  it("another verified email cannot make itself admin", async () => {
    await assertFails(setDoc(doc(as("eve", { email: "eve@example.com", email_verified: true }), "users/eve"), { role: "admin" }));
  });

  it("a student cannot read another user's profile or progress", async () => {
    await assertFails(getDoc(doc(as("bob"), "users/alice")));
    await assertFails(getDoc(doc(as("bob"), "users/alice/progress/p1")));
    await assertFails(getDocs(collection(as("bob"), "users")));
  });

  it("a user keeps full access to their own progress", async () => {
    const db = as("alice");
    await assertSucceeds(getDoc(doc(db, "users/alice/progress/p1")));
    await assertSucceeds(setDoc(doc(db, "users/alice/progress/p2"), { solved: false }));
    await assertSucceeds(deleteDoc(doc(db, "users/alice/progress/p2")));
  });

  it("an admin can list all profiles", async () => {
    await assertSucceeds(getDocs(collection(as("adam"), "users")));
  });

  it("a teacher cannot list profiles", async () => {
    await assertFails(getDocs(collection(as("tina"), "users")));
  });

  it("an admin can change another user's role", async () => {
    await assertSucceeds(updateDoc(doc(as("adam"), "users/alice"), { role: "teacher" }));
    await assertSucceeds(updateDoc(doc(as("adam"), "users/tina"), { role: "student" }));
  });

  it("an admin cannot set an unknown role", async () => {
    await assertFails(updateDoc(doc(as("adam"), "users/alice"), { role: "superuser" }));
  });

  it("an admin can only change the role of other users", async () => {
    await assertFails(updateDoc(doc(as("adam"), "users/alice"), { role: "teacher", displayName: "Hacked" }));
    await assertFails(setDoc(doc(as("adam"), "users/alice/progress/p1"), { solved: false }));
  });

  it("an admin cannot change their own role", async () => {
    await assertFails(updateDoc(doc(as("adam"), "users/adam"), { role: "student" }));
  });
});

describe("student history for teachers and admins", () => {
  const share = (uid: string, version: string) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `users/${uid}`), { consent: { version, terms: true, privacy: true, age: true, activity: true } }, { merge: true });
      await setDoc(doc(db, `users/${uid}/submissions/s1`), { problemId: "p1", solved: true });
    });

  it("teachers and admins read a sharing student's profile, progress and submissions", async () => {
    await share("alice", "2026-11-14.2");
    for (const who of ["tina", "adam"]) {
      const db = as(who);
      await assertSucceeds(getDoc(doc(db, "users/alice")));
      await assertSucceeds(getDocs(collection(db, "users/alice/progress")));
      await assertSucceeds(getDocs(collection(db, "users/alice/submissions")));
    }
  });

  it("consent to live activity alone (the first version) does not share history", async () => {
    await share("alice", "2026-11-14");
    await assertFails(getDoc(doc(as("tina"), "users/alice")));
    await assertFails(getDocs(collection(as("tina"), "users/alice/progress")));
    await assertFails(getDocs(collection(as("adam"), "users/alice/submissions")));
  });

  it("a student without consent is not readable by teachers", async () => {
    await assertFails(getDoc(doc(as("tina"), "users/alice")));
    await assertFails(getDocs(collection(as("tina"), "users/alice/submissions")));
  });

  it("other students still cannot read a sharing student's history", async () => {
    await share("alice", "2026-11-14.2");
    await assertFails(getDoc(doc(as("bob"), "users/alice")));
    await assertFails(getDocs(collection(as("bob"), "users/alice/submissions")));
  });

  it("teachers and admins cannot write a student's history", async () => {
    await share("alice", "2026-11-14.2");
    await assertFails(setDoc(doc(as("tina"), "users/alice/submissions/s2"), { problemId: "p1", solved: true }));
    await assertFails(deleteDoc(doc(as("adam"), "users/alice/submissions/s1")));
    await assertFails(setDoc(doc(as("tina"), "users/alice/progress/p1"), { solved: false }));
  });
});

describe("problems", () => {
  it("anyone can read problems, guests included", async () => {
    await assertSucceeds(getDoc(doc(guest(), "problems/p1")));
    await assertSucceeds(getDocs(collection(guest(), "problems")));
  });

  it("nobody can write problems from the client", async () => {
    await assertFails(setDoc(doc(as("adam"), "problems/p2"), { title: "x" }));
    await assertFails(setDoc(doc(guest(), "problems/p2"), { title: "x" }));
  });
});

describe("solutions", () => {
  it("guests and students cannot read solutions", async () => {
    await assertFails(getDoc(doc(guest(), "solutions/p1")));
    await assertFails(getDoc(doc(as("alice"), "solutions/p1")));
    await assertFails(getDoc(doc(as("bob"), "solutions/p1")));
    await assertFails(getDocs(collection(as("alice"), "solutions")));
  });

  it("teachers and admins can read solutions", async () => {
    await assertSucceeds(getDoc(doc(as("tina"), "solutions/p1")));
    await assertSucceeds(getDoc(doc(as("adam"), "solutions/p1")));
    await assertSucceeds(getDocs(collection(as("adam"), "solutions")));
  });

  it("nobody can write solutions from the client", async () => {
    await assertFails(setDoc(doc(as("adam"), "solutions/p1"), { lines: [] }));
    await assertFails(setDoc(doc(as("tina"), "solutions/p2"), { lines: [] }));
  });
});

describe("consent", () => {
  const consent = (over: Record<string, unknown> = {}) => ({
    version: "v1",
    terms: true,
    privacy: true,
    age: true,
    activity: true,
    at: serverTimestamp(),
    ...over,
  });

  it("the owner records their consent", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), { consent: consent() }, { merge: true }));
    await assertSucceeds(setDoc(doc(as("bob"), "users/bob"), { displayName: "Bob", consent: consent() }));
  });

  it("consent must be well-formed and use the server time", async () => {
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { consent: consent({ at: new Date(0) }) }, { merge: true }));
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { consent: consent({ terms: "yes" }) }, { merge: true }));
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { consent: consent({ extra: 1 }) }, { merge: true }));
  });

  it("every item, live activity included, must be agreed to", async () => {
    for (const item of ["terms", "privacy", "age", "activity"]) {
      await assertFails(setDoc(doc(as("alice"), "users/alice"), { consent: consent({ [item]: false }) }, { merge: true }));
    }
  });

  it("other profile edits keep working after consent", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "users/alice"), { consent: { ...consent(), at: new Date(0) } }, { merge: true }),
    );
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), { displayName: "Al" }, { merge: true }));
  });

  it("nobody else, not even an admin, records consent for a user", async () => {
    await assertFails(setDoc(doc(as("adam"), "users/alice"), { consent: consent() }, { merge: true }));
    await assertFails(setDoc(doc(as("tina"), "users/alice"), { consent: consent() }, { merge: true }));
  });
});

describe("presence", () => {
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "users/alice"), { consent: { version: "v1", terms: true, privacy: true, age: true, activity: true } }, { merge: true }),
    ),
  );

  const presence = (uid: string, over: Record<string, unknown> = {}) => ({
    uid,
    name: "Alice",
    email: "alice@example.com",
    path: "/problems/p1",
    problemId: "p1",
    problemTitle: "1. One",
    problemSince: null,
    lineCount: 3,
    idle: false,
    hidden: false,
    events: [],
    heartbeatAt: serverTimestamp(),
    ...over,
  });

  it("a student writes their own presence", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "presence/alice"), presence("alice")));
    await assertSucceeds(setDoc(doc(as("alice"), "presence/alice"), presence("alice", { idle: true })));
    await assertSucceeds(deleteDoc(doc(as("alice"), "presence/alice")));
  });

  it("a student without activity consent (e.g. an older account) cannot write presence", async () => {
    await assertFails(setDoc(doc(as("bob"), "presence/bob"), presence("bob")));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "users/alice"), { consent: { activity: false } }, { merge: true }),
    );
    await assertFails(setDoc(doc(as("alice"), "presence/alice"), presence("alice")));
  });

  it("nobody writes someone else's presence", async () => {
    await assertFails(setDoc(doc(as("bob"), "presence/alice"), presence("alice")));
    await assertFails(setDoc(doc(as("bob"), "presence/alice"), presence("bob")));
    await assertFails(setDoc(doc(as("tina"), "presence/alice"), presence("alice")));
    await assertFails(setDoc(doc(guest(), "presence/alice"), presence("alice")));
  });

  it("presence must use the server time and known fields", async () => {
    await assertFails(setDoc(doc(as("alice"), "presence/alice"), presence("alice", { heartbeatAt: new Date(0) })));
    await assertFails(setDoc(doc(as("alice"), "presence/alice"), presence("alice", { role: "admin" })));
    await assertFails(setDoc(doc(as("alice"), "presence/alice"), presence("alice", { events: Array(11).fill({}) })));
  });

  it("teachers and admins read all presence; students and guests read none", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "presence/alice"), { uid: "alice" }));
    await assertSucceeds(getDocs(collection(as("tina"), "presence")));
    await assertSucceeds(getDoc(doc(as("adam"), "presence/alice")));
    await assertFails(getDoc(doc(as("alice"), "presence/alice")));
    await assertFails(getDocs(collection(as("bob"), "presence")));
    await assertFails(getDocs(collection(guest(), "presence")));
  });
});

describe("bug reports", () => {
  const report = (over: Record<string, unknown> = {}) => ({
    problemId: "p1",
    problemTitle: "1. One",
    message: "My proof is right but it is rejected.",
    proof: [{ depth: 0, kind: "premise", text: "P", rule: "", refs: "" }],
    path: "/problems/p1",
    uid: null,
    email: null,
    status: "open",
    createdAt: serverTimestamp(),
    ...over,
  });
  const alice = () => as("alice", { email: "alice@example.com" });
  const mine = { uid: "alice", email: "alice@example.com" };

  beforeEach(() => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "bugReports/r1"), report({ createdAt: new Date(0) }))));

  it("guests and signed-in users send reports", async () => {
    await assertSucceeds(addDoc(collection(guest(), "bugReports"), report()));
    await assertSucceeds(addDoc(collection(alice(), "bugReports"), report(mine)));
    // An account with no email on its token reports with a null email.
    await assertSucceeds(addDoc(collection(as("bob"), "bugReports"), report({ uid: "bob" })));
  });

  it("a report cannot claim to be from someone else", async () => {
    await assertFails(addDoc(collection(guest(), "bugReports"), report(mine)));
    await assertFails(addDoc(collection(guest(), "bugReports"), report({ email: "alice@example.com" })));
    await assertFails(addDoc(collection(as("bob"), "bugReports"), report(mine)));
    await assertFails(addDoc(collection(alice(), "bugReports"), report({ ...mine, email: "tina@example.com" })));
    await assertFails(addDoc(collection(alice(), "bugReports"), report()));
  });

  it("a report must be well-formed and within the size caps", async () => {
    const send = (over: Record<string, unknown>) => addDoc(collection(guest(), "bugReports"), report(over));
    await assertSucceeds(send({ message: "x".repeat(2000), proof: Array(200).fill({}) }));
    await assertFails(send({ message: "" }));
    await assertFails(send({ message: "x".repeat(2001) }));
    await assertFails(send({ message: 42 }));
    await assertFails(send({ proof: Array(201).fill({}) }));
    await assertFails(send({ proof: "P" }));
    await assertFails(send({ path: "x".repeat(201) }));
    await assertFails(send({ status: "resolved" }));
    await assertFails(send({ createdAt: new Date(0) }));
    await assertFails(send({ role: "admin" }));
    const withoutMessage: Record<string, unknown> = report();
    delete withoutMessage.message;
    await assertFails(addDoc(collection(guest(), "bugReports"), withoutMessage));
  });

  it("only admins read reports", async () => {
    await assertSucceeds(getDocs(collection(as("adam"), "bugReports")));
    await assertSucceeds(getDoc(doc(as("adam"), "bugReports/r1")));
    await assertFails(getDocs(collection(as("tina"), "bugReports")));
    await assertFails(getDoc(doc(as("alice"), "bugReports/r1")));
    await assertFails(getDoc(doc(guest(), "bugReports/r1")));
  });

  it("only admins resolve and reopen reports, and change nothing else", async () => {
    await assertSucceeds(updateDoc(doc(as("adam"), "bugReports/r1"), { status: "resolved" }));
    await assertSucceeds(updateDoc(doc(as("adam"), "bugReports/r1"), { status: "open" }));
    await assertFails(updateDoc(doc(as("adam"), "bugReports/r1"), { status: "wontfix" }));
    await assertFails(updateDoc(doc(as("adam"), "bugReports/r1"), { message: "edited" }));
    await assertFails(updateDoc(doc(as("tina"), "bugReports/r1"), { status: "resolved" }));
    await assertFails(updateDoc(doc(as("alice"), "bugReports/r1"), { status: "resolved" }));
    await assertFails(updateDoc(doc(guest(), "bugReports/r1"), { status: "resolved" }));
  });

  it("nobody deletes reports", async () => {
    await assertFails(deleteDoc(doc(as("adam"), "bugReports/r1")));
    await assertFails(deleteDoc(doc(guest(), "bugReports/r1")));
  });
});
