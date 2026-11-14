# Report a bug on each problem: design

## Intent

A student who finds something wrong with a problem (a bad statement or hint, a
correct proof being rejected) can tell the site admins from the problem page,
with enough attached for an admin to reproduce it.

## Goals and non-goals

- Every problem page has a "Report a bug" button.
- Anyone can report, guests included, because guests can solve problems too.
- Admins read and resolve reports on the Admin page.
- Not in scope: email or push notifications, replies to the reporter, teachers
  seeing reports, deleting reports, rate limiting beyond field size caps.

## Approaches

1. **Firestore collection plus an Admin page section (chosen).** Uses what the
   app already has (Firestore, role rules, the admin-only page) and can attach
   the student's current proof.
2. `mailto:` link. Rejected: `SITE.contactEmail` is still a placeholder, and
   the proof is lost.
3. Prefilled GitHub issue link. Rejected: students would need GitHub accounts.

## Design

**Data.** `bugReports/{autoId}`:

| Field | Value |
| --- | --- |
| `problemId`, `problemTitle` | the problem, title as "3. Modus Tollens" |
| `message` | the reporter's text, 1 to 2,000 characters |
| `proof` | the editor's current lines (`depth`, `kind`, `text`, `rule`, `refs`), at most 200 |
| `path` | the page path |
| `uid`, `email` | the signed-in reporter, or both `null` for a guest |
| `status` | `"open"` on create; admins set `"resolved"` or back to `"open"` |
| `createdAt` | server time |

**Rules.** Create: anyone, with exactly these fields, the size caps above,
`status == "open"`, `createdAt == request.time`, and `uid`/`email` matching the
caller's auth (null for guests) so a report can't impersonate someone. Read:
admins. Update: admins, `status` only. Delete: nobody.

**Problem page.** A "Report a bug" text button in the Proof panel header next
to Reset opens a modal dialog: a textarea, Cancel and Send. After sending it
shows a thank-you and closes on Done. A failed send shows the error and keeps
the text.

**Admin page.** A "Bug reports" section below the users table, open reports
first then newest first. Each shows the problem (linked), reporter, time,
message, an expandable copy of the attached proof, and a Resolve / Reopen
button. A stat tile shows the open count.

## Left to the builder

Component and file layout, exact styling (follow the existing Tailwind tokens).
