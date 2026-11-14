// Uploads the seed problems and model answers to Firestore.
//
//   npm run upload-problems -- --project <projectId> [--prune]
//
// Production needs Admin credentials: set GOOGLE_APPLICATION_CREDENTIALS to a
// service-account key downloaded from the Firebase console. To target the
// emulator instead, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
//
// Every answer is checked with the proof checker first; if any fails, nothing
// is uploaded. Documents for problems no longer in the seed are only deleted
// with --prune.

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { PROBLEMS } from "../seed/problems";
import { build, SOLUTIONS } from "../seed/solutions";
import { checkProof } from "../src/lib/fitch/checker";
import { parseFormula } from "../src/lib/fitch/formula";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}

async function main() {
  const projectId = arg("project") ?? process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("Pass --project <projectId>");
  const prune = process.argv.includes("--prune");

  // 1. Validate everything before writing anything.
  const problems = new Set(PROBLEMS.map((p) => p.id));
  const errors: string[] = [];
  if (problems.size !== PROBLEMS.length) errors.push("Two problems share an id");
  for (const p of PROBLEMS) {
    const rows = SOLUTIONS[p.id];
    if (!rows) {
      errors.push(`${p.id}: no model answer`);
      continue;
    }
    const result = checkProof(build(rows), parseFormula(p.goal));
    if (!result.solved) errors.push(`${p.id}: model answer does not check (${result.message})`);
  }
  for (const id of Object.keys(SOLUTIONS)) if (!problems.has(id)) errors.push(`${id}: answer without a problem`);
  if (errors.length) {
    console.error(`Nothing uploaded. Fix these first:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }

  const target = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : `project ${projectId}`;
  console.log(`Uploading ${PROBLEMS.length} problems and answers to ${target}…`);

  initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() });
  const db = getFirestore();

  // 2. Write problems and solutions (batches hold at most 500 writes).
  const writes = PROBLEMS.flatMap((p) => {
    const { id, ...fields } = p;
    const lines = build(SOLUTIONS[id]).map(({ depth, kind, text, rule, refs }) => ({ depth, kind, text, rule, refs }));
    return [
      { ref: db.doc(`problems/${id}`), data: { ...fields, updatedAt: FieldValue.serverTimestamp() } },
      { ref: db.doc(`solutions/${id}`), data: { lines, updatedAt: FieldValue.serverTimestamp() } },
    ];
  });
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) batch.set(w.ref, w.data);
    await batch.commit();
  }

  // 3. Report (and with --prune, delete) documents no longer in the seed.
  for (const col of ["problems", "solutions"]) {
    const stale = (await db.collection(col).listDocuments()).filter((d) => !problems.has(d.id));
    if (!stale.length) continue;
    if (prune) {
      await Promise.all(stale.map((d) => d.delete()));
      console.log(`Deleted ${stale.length} stale ${col}: ${stale.map((d) => d.id).join(", ")}`);
    } else {
      console.log(`Not in the seed (rerun with --prune to delete) ${col}: ${stale.map((d) => d.id).join(", ")}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
