import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
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
