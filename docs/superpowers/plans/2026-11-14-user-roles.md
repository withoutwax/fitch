# User Roles and Firestore Problems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give accounts admin/teacher/student roles enforced by Firestore rules, make model answers teacher-only, and serve problems and answers from Firestore.

**Architecture:** Roles live in `users/{uid}.role`, checked by `firestore.rules`. Problems and solutions live in `problems/{id}` and `solutions/{id}`, uploaded by a `firebase-admin` script from seed files that the app never imports. Server components read problems through the Firestore REST API inside `'use cache'`; teachers read solutions from the client SDK.

**Tech Stack:** Next.js 16 (Cache Components), Firebase JS SDK 13, firebase-admin, @firebase/rules-unit-testing, vitest, vite-node.

**Spec:** `docs/superpowers/specs/2026-11-14-user-roles-design.md`

## Global Constraints

- Bootstrap admin email: `rlagmlckd@gmail.com`, only with `email_verified == true`.
- Roles: `"admin" | "teacher" | "student"`; missing means student.
- No file under `src/` may import the seed files (ESLint `no-restricted-imports`).
- `npm test` stays emulator-free; rules tests run with `npm run test:rules`.
- No deploy, upload or push to production without the owner's go-ahead (given: "Proceed. Deploy").

## Review Focus

- A student writing `role` in the same `setDoc(..., {merge:true})` as their profile: must be denied (test: `student cannot add role on update`).
- An admin editing another user's profile fields besides `role`: must be denied (test: `admin can only change role of others`).
- Problems fetch failing (rules not deployed, network): problem pages must error loudly, not cache an empty list (loader throws on non-OK).
- Seed answer that fails the checker: upload aborts before writing anything (script validates first).
- Teacher whose role is revoked mid-session: the role is read live, so "See solution" disappears and reads are denied.

---

### Task 1: Rules and rules tests

**Files:** Modify `firestore.rules`, `package.json`; Create `rules-tests/firestore.rules.test.ts`, `vitest.rules.config.ts`; Modify vitest config so `npm test` excludes `rules-tests/`.

- [ ] Add dev deps `@firebase/rules-unit-testing`, `firebase-admin`.
- [ ] Write tests: student can't create profile with `role`; can't add/change `role` on update; bootstrap email (verified) can set own role `admin`, unverified can't, other email can't; admin reads any profile and sets another's role to teacher/student; admin can't change another's other fields; student can't read another profile; guest reads `problems`; nobody writes `problems`/`solutions`; student/guest can't read `solutions`; teacher and admin can.
- [ ] Run `npm run test:rules` → fails on current rules.
- [ ] Rewrite `firestore.rules` per spec → passes. Commit.

### Task 2: Seed files, upload script, server loader

**Files:** Move `src/lib/fitch/problems.ts` → `seed/problems.ts` (keep the `Problem`, `Difficulty`, `Category` types in `src/lib/fitch/problemTypes.ts`), `src/lib/fitch/solutions.ts` → `seed/solutions.ts`, `problems.test.ts` → `seed/`. Create `scripts/upload-problems.ts`, `src/lib/problemsServer.ts`; Modify `eslint.config.mjs`.

- Produces: `getProblems(): Promise<Problem[]>` (sorted by `number`), `getProblem(id): Promise<Problem | null>` in `src/lib/problemsServer.ts` (`'use cache'`, `cacheLife('minutes')`, Firestore REST `documents/problems?pageSize=1000`, emulator host when `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, throws on non-OK).
- Produces: `toSolutionDoc(rows: Row[])` → `{ lines: ProofLine-like maps }` in `seed/solutions.ts`; script validates every seed answer with `checkProof`, writes all docs in batches, deletes stale ids only with `--prune`.
- [ ] Move files, fix imports, `npm test` passes.
- [ ] Unit test for the REST value decoder (`decodeFields`) in `src/lib/problemsServer.test.ts`.
- [ ] Script runs against the emulator. Commit.

### Task 3: Roles and answers in the UI

**Files:** Modify `AuthProvider.tsx` (expose `role`, live `onSnapshot`), `progress.ts` (`ensureProfile` bootstrap), `NavBar.tsx`, `Solver.tsx`, `problems/page.tsx`, `problems/[id]/page.tsx`, `page.tsx`, `profile/page.tsx`; Create `src/app/admin/page.tsx`, `src/lib/roles.ts`, `src/lib/solutions.ts` (`loadSolution(id): Promise<ProofLine[] | null>`).

- [ ] Pages take problems from `getProblems()`/`getProblem()` and pass them to client components.
- [ ] Students see no answer UI; teachers/admins see "See solution" (list links to `/problems/{id}?solution=1`).
- [ ] Admin page: users table with role select; counts of problems with/without solutions.
- [ ] `npm test`, `npx eslint src`, `npm run build` (against emulator data) pass. Commit.

### Task 4: Rollout (owner approved)

- [ ] Find the production project id (Vercel env), `firebase deploy --only firestore:rules --project <id>`.
- [ ] Run upload against production (needs service-account key).
- [ ] Push `main`.
