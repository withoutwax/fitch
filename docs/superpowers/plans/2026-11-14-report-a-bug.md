# Report a Bug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Report a bug" button on every problem page that saves a report to Firestore, and a "Bug reports" section on the Admin page to read and resolve them.

**Architecture:** Reports are documents in a top-level `bugReports` collection, written straight from the browser with the Firebase client SDK. `firestore.rules` is the only enforcement: anyone creates, admins read and change `status`.

**Tech Stack:** Next.js 16 client components, Firebase Firestore, Tailwind v4, Vitest + `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-11-14-report-a-bug-design.md`

## Global Constraints

- Fields are exactly: `problemId`, `problemTitle`, `message`, `proof`, `path`, `uid`, `email`, `status`, `createdAt`.
- `message` 1 to 2,000 characters; `proof` at most 200 lines; `problemId` ≤ 100, `problemTitle` ≤ 200, `path` ≤ 200 characters.
- `status` is `"open"` or `"resolved"`; `"open"` on create.
- No new dependencies.

## Review Focus

- A guest (signed out) sends a report: it must save, with `uid` and `email` null. (Task 1 test)
- A signed-in user sends a report naming someone else's uid or email: refused. (Task 1 test)
- A message of only whitespace: Send stays disabled. (Task 2, manual)
- A proof longer than 200 lines: the client sends the first 200 so the report still saves. (Task 2)
- The send fails (offline, rules): the dialog shows the error and keeps the text. (Task 2, manual)

---

### Task 1: Rules and rules tests

**Files:** Modify `firestore.rules`, `rules-tests/firestore.rules.test.ts`

- [ ] Add a `describe("bug reports")` block with a `report(over)` helper building a valid guest report (`uid: null, email: null, status: "open", createdAt: serverTimestamp()`), and tests:
  - a guest creates a report; a signed-in user creates one with their own uid and token email
  - refused: someone else's uid, a guest with a uid, a mismatched email, an empty message, a 2,001-character message, an extra field, `status: "resolved"`, a client-chosen `createdAt`, 201 proof lines
  - admins read and list; guests, students and teachers do not
  - an admin sets `status` to `"resolved"`; an admin cannot edit `message` or set an unknown status; a student cannot update; nobody deletes
- [ ] Run `npm run test:rules`; the new tests fail.
- [ ] Add `match /bugReports/{id}` to `firestore.rules` per the spec's Rules section.
- [ ] Run `npm run test:rules`; all pass. Commit.

### Task 2: Client library and report dialog

**Files:** Create `src/lib/bugReports.ts`, `src/components/ReportBug.tsx`; modify `src/app/problems/[id]/Solver.tsx`

**Interfaces (produced):**

```ts
export interface BugReport {
  id: string; problemId: string; problemTitle: string; message: string;
  proof: StoredLine[]; path: string; uid: string | null; email: string | null;
  status: "open" | "resolved"; createdAt: Date | null;
}
export const MAX_MESSAGE = 2000;
export function submitBugReport(r: { problemId: string; problemTitle: string; message: string; lines: ProofLine[]; path: string; user: User | null }): Promise<void>;
export function loadBugReports(): Promise<BugReport[]>;          // open first, then newest first
export function setBugReportStatus(id: string, status: BugReport["status"]): Promise<void>;
// ReportBug.tsx
export function ReportBug(props: { problemId: string; problemTitle: string; lines: ProofLine[] | null }): JSX.Element;
```

- [ ] Implement `bugReports.ts`. `submitBugReport` trims the message, drops line ids and sends at most 200 lines.
- [ ] Implement `ReportBug`: a text button that opens a native `<dialog>` (`showModal`) with a textarea (`maxLength={MAX_MESSAGE}`), Cancel and Send; a thank-you state after sending; an inline error on failure.
- [ ] Render `<ReportBug>` in the Proof panel header of `Solver.tsx`, left of Reset.
- [ ] `npm run lint` and `npx tsc --noEmit` pass. Commit.

### Task 3: Admin page section

**Files:** Modify `src/app/admin/AdminView.tsx`

- [ ] Load reports with `loadBugReports()` alongside users; add an "Open bug reports" stat tile.
- [ ] Add a "Bug reports" section below the users table: problem link, reporter (email or "Guest"), time, message, a `<details>` with the attached proof as text, and a Resolve / Reopen button calling `setBugReportStatus`.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` pass. Check both pages in the browser against the emulators. Commit.
