import { Suspense } from "react";
import { getProblems } from "@/lib/problemsServer";
import { StudentView } from "./StudentView";

export const metadata = { title: "Student — Fitch" };

// The student is named in the query (/activity/student?id=uid) rather than a
// path segment, so the page keeps a static shell like the rest of the site.
export default async function StudentPage() {
  const problems = await getProblems();
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <StudentView problems={problems} />
    </Suspense>
  );
}
