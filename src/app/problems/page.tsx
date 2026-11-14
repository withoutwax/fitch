import { getProblems } from "@/lib/problemsServer";
import { ProblemList } from "./ProblemList";

export default async function ProblemsPage() {
  return <ProblemList problems={await getProblems()} />;
}
