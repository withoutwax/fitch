import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProblem, getProblems } from "@/lib/problemsServer";
import { Solver } from "./Solver";

export async function generateStaticParams() {
  return (await getProblems()).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/problems/[id]">) {
  const found = await getProblem((await params).id);
  return { title: found ? `${found.problem.number}. ${found.problem.title} — Fitch` : "Fitch" };
}

export default function ProblemPage({ params }: PageProps<"/problems/[id]">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Problem params={params} />
    </Suspense>
  );
}

const brief = (p: { id: string; number: number; title: string } | null) => (p ? { id: p.id, number: p.number, title: p.title } : null);

async function Problem({ params }: { params: PageProps<"/problems/[id]">["params"] }) {
  const found = await getProblem((await params).id);
  if (!found) notFound();
  const { problem, prev, next } = found;
  return <Solver key={problem.id} problem={problem} prev={brief(prev)} next={brief(next)} />;
}
