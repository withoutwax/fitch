import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PROBLEM_BY_ID, PROBLEMS } from "@/lib/fitch/problems";
import { Solver } from "./Solver";

export function generateStaticParams() {
  return PROBLEMS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/problems/[id]">) {
  const problem = PROBLEM_BY_ID[(await params).id];
  return { title: problem ? `${problem.number}. ${problem.title} — Fitch` : "Fitch" };
}

export default function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Problem params={params} />
    </Suspense>
  );
}

async function Problem({ params }: { params: PageProps<"/problems/[id]">["params"] }) {
  const problem = PROBLEM_BY_ID[(await params).id];
  if (!problem) notFound();
  return <Solver key={problem.id} problem={problem} />;
}
