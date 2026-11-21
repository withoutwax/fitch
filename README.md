# Fitch

A LeetCode-style practice site for Fitch natural deduction proofs. Students pick from 100 problems, build proofs in a
line-by-line editor that checks every step as they type, and see what they've solved (and when) on their profile.
No account is needed: guests' progress is saved in the browser, and moves into their Firebase account when they sign in.

Built with Next.js (App Router) and Firebase (Auth + Firestore).

## Proof workspace

Open `/workspace` to build standalone proofs using Stanford Fitch notation such as `AX:p(X)`.
The workspace supports object and function constants, the Stanford rule buttons, and Stanford Fitch XML files.
The guided exercises use the same checker and keep their required premises and goal.
Shortcuts are available in the workspace. A guided exercise can enable them with `allowShortcut: true`.

## Run it locally (no Firebase account needed)

Local development uses the Firebase Emulator Suite with the offline project `demo-fitch`, so nothing touches the cloud.
Requires the Firebase CLI (`npm i -g firebase-tools`) and Java.

```bash
npm install
npm run emulators   # terminal 1: auth on :9099, Firestore on :8080, emulator UI on :4000
npm run dev         # terminal 2: http://localhost:3000
```

`.env.local` is already set up for the emulators. Accounts you create locally live only in the emulator and vanish when it
stops. Browse them at http://127.0.0.1:4000.

## Connect a real Firebase project

1. In the [Firebase console](https://console.firebase.google.com), create a project and add a **Web app**.
2. **Authentication → Sign-in method**: enable **Email/Password** and **Google**. Under **Settings → Authorized domains**,
   add your deployed domain.
3. **Firestore Database**: create a database (production mode).
4. Deploy the security rules (each student can only read and write their own data):
   ```bash
   firebase login
   firebase use --add            # pick your project
   firebase deploy --only firestore:rules
   ```
5. Copy `.env.example` to `.env.local` (and to your hosting provider's env settings), fill in the web app config, and set
   `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false`.

## Before going live

Replace the placeholder operator name and contact email in `src/lib/site.ts`. They appear in the Privacy Policy (`/privacy`)
and Terms of Service (`/terms`). Have those pages reviewed for your school or jurisdiction: they're a starting point, not legal advice.

## Data model

```
users/{uid}                        displayName, email, lastSeenAt
users/{uid}/progress/{problemId}   solved, attempts, firstSolvedAt, lastSolvedAt, lastAttemptAt, proof (last accepted)
users/{uid}/submissions/{id}       problemId, solved, lineCount, at   (drives history + activity calendar)
```

Guests get the same data in `localStorage` under `fitch:guest` (see `src/lib/localProgress.ts`).

## Project layout

- `src/lib/fitch/formula.ts` parses and prints Unicode and Stanford ASCII formulas and terms.
- `src/lib/fitch/checker.ts` validates proof steps, subproofs, and citation scope.
- `src/lib/fitch/stanfordXml.ts` reads and writes Stanford proof archives.
- `seed/problems.ts` and `seed/solutions.ts` define the exercises and model answers.
- `src/components/ProofEditor.tsx` implements the shared proof editor.
- `src/app/workspace/` hosts the standalone proof workspace.

```bash
npm test   # verifies every problem is solvable and that bad proofs are rejected
```

### Adding a problem

Append an entry to `PROBLEMS` in `seed/problems.ts`, add a model proof to `SOLUTIONS` in `seed/solutions.ts`, and run
`npm test`.

## Notes

Proofs are checked in the browser and the result is written by the client, so a determined student could forge a "solved"
record. That's fine for practice. If grades depend on it, move the check into a Cloud Function or a Next.js server action and
have it write the progress docs instead.
