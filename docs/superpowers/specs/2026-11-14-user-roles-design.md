# User roles, and problems and answers in Firestore

## Intent

Fitch accounts get one of three roles. The reason today is model answers:
teachers should be able to see the solution to every problem, and students
should not. Admins run the site and decide who is a teacher.

The site owner's account (rlagmlckd@gmail.com, Google sign-in) is the first admin.

The problem set also moves from code into Firestore. The owner's view is that
the problems are the site's data, so they belong in the database rather than in
the code; this also prepares for editing problems inside the site later.

## Goals

- Every account has exactly one role: `admin`, `teacher` or `student`.
  New sign-ups, and every existing account, are students until changed.
- Teachers and admins see a "See solution" button for every problem, on the
  problem list and on the problem page. No lock, no confirmation, and viewing
  does not mark their own progress as "solved with answer".
- Students and guests can no longer see model answers at all, and cannot get
  them by reading the site's JavaScript or by querying Firestore.
- Admins have an Admin page listing all users, where they change anyone's role.
- Roles are enforced in `firestore.rules`. A student can never make
  themselves a teacher or admin.
- The app reads problems from Firestore, not from code. Changing a problem in
  Firestore changes the site without a deploy.

## Non-goals

- Editing problems inside the site (a later, admin-only feature; until then
  problems change through the upload script).
- Classes, groups, or teachers seeing their students' progress.
- Teachers assigning work.

## Anti-goals

- Answers still reachable by a student through the JS bundle or a direct
  Firestore read: that would make "teacher-only" a UI fiction.
- Any way for a user to change their own role, except the one bootstrap
  admin email below.
- A broken problem or answer going live: anything uploaded must pass the
  checker first.
- Problem pages becoming noticeably slower, or every page view costing
  Firestore reads.

## Approaches considered

- **Answers in a server route** (answers in server-only code, a Next.js route
  checks the caller's role via Firestore). Not chosen.
- **Answers and problems in Firestore (chosen by the user).** A `problems`
  collection anyone can read and a `solutions` collection only teachers and
  admins can read, both filled by an upload script run with admin
  credentials. Every access check lives in `firestore.rules`.
- **Keep problems in code, move only answers** was recommended and declined:
  the owner wants problems in Firestore.
- Firebase custom claims for roles were ruled out: setting them needs the
  Admin SDK on a trusted server, and a Firestore field checked by the rules
  gives the same guarantee.

## Design

### Data

- `users/{uid}.role`: `"admin" | "teacher" | "student"`; a missing field means student.
- `problems/{id}`: the fields of today's `Problem` (`number`, `title`,
  `difficulty`, `category`, `premises`, `goal`, `description`, `hint`).
- `solutions/{id}`: `{ lines: [{ depth, kind, text, rule, refs }], updatedAt }`
  (an array of maps, because Firestore can't store the nested arrays that
  `solutions.ts` uses).

### Firestore rules

- `role(uid)` reads `users/{uid}.role`, defaulting to `"student"`.
- `users/{uid}` and everything under it: the owner keeps read/write, except
  that the owner's writes may not add or change `role`. Exception: when the
  signed-in token has `email == "rlagmlckd@gmail.com"` and
  `email_verified == true`, the owner may set their own role to `"admin"`.
- Admins may read every `users/{uid}` profile (for the Admin page) and may
  update another user's `role` (only that field) to one of the three values.
- `problems/{id}`: anyone may read, guests included; no client writes.
- `solutions/{id}`: read if role is teacher or admin; no client writes.
- Everything else stays denied.

### Bootstrap admin

`ensureProfile` writes `role: "admin"` when the signed-in email is the
bootstrap email and the profile has no role yet. After that, the profile
field is the single source of truth.

### Reading problems in the app

- A server-side loader fetches the `problems` collection through the
  Firestore REST API (public reads need no credentials) inside a `'use cache'`
  function with a `cacheLife` of a few minutes (the app already has
  `cacheComponents` on). Pages stay server-rendered and fast, Firestore is
  read once per cache period rather than per visitor, and edits show up within
  minutes without a deploy.
- Every place that imports `PROBLEMS` / `PROBLEM_BY_ID` today (home page,
  problem list, problem page, Solver's "next problem", profile page) gets
  problems from that loader instead, passed from server components to client
  components as props.
- Problem pages are rendered on demand rather than pre-built from a fixed
  list; an unknown id still gives a 404.

### Seed files and upload script

- `problems.ts` and `solutions.ts` move out of the app into seed files (for
  example `seed/problems.ts`, `seed/solutions.ts`). The app never imports them;
  an ESLint `no-restricted-imports` rule enforces this for `src/`.
  The existing tests keep checking the seed files.
- `scripts/upload-problems.ts`, run with `vite-node` (installed with vitest)
  and `firebase-admin` (new dev dependency), via `npm run upload-problems`:
  1. Checks every problem's answer with the proof checker; uploads nothing if
     any fails.
  2. Writes `problems/{id}` and `solutions/{id}` for every seed problem.
  3. Deletes problem and solution docs whose ids are no longer in the seed
     (asks for `--prune` before deleting).
- Credentials: `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service-account
  key downloaded from the Firebase console (gcloud isn't installed). With
  `FIRESTORE_EMULATOR_HOST` set it targets the emulator.
- Until the in-site editor exists, the workflow for a new problem is: edit the
  seed files, run the tests, run the upload script.

### Client

- `AuthProvider` exposes `role`, read live from the user's profile document.
  Guests have no role.
- NavBar: an "Admin" link for admins.
- Problem list: "See solution" per problem for teachers/admins (opens the
  problem page with the answer shown).
- Problem page (`Solver.tsx`): students see no answer UI. Teachers/admins see
  "See solution", which reads `solutions/{id}` and shows it in the existing
  model-answer panel (including "Copy into editor"). It does not call
  `recordAnswerView`.
- Admin page: list of users with role controls, plus a count of problems with
  and without an uploaded answer.
- Profile page: shows the user's role.
- Existing "Solved with answer" history is kept and still displayed.

### Tests

- Rules tests with `@firebase/rules-unit-testing` against the Firestore
  emulator, run by `npm run test:rules` (`firebase emulators:exec`).
  `npm test` stays emulator-free. Cases: student can't set own role on
  create or update; guest can read problems; nobody can write problems or
  solutions from the client; student can't read solutions; teacher can;
  bootstrap email can self-promote only when verified; other emails can't;
  admin can change another user's role and read all profiles; student can't
  read another user's profile.
- Existing vitest tests (now on the seed files) and `next build` must pass.
  The build runs with the emulator or production data for problems; the plan
  decides how the build reaches Firestore.

### Rollout (each step needs the owner's go-ahead)

1. Deploy the rules: `firebase deploy --only firestore:rules`.
2. Run the upload script against production.
3. Push `main` so Vercel deploys the app.

Order matters: the new app shows no problems until step 2 has run.

## Left to the builder

Layout and wording of the Admin page and buttons; how the role is shown on
the profile page; exact cache lifetime; test file layout.
