import { getProblems } from "@/lib/problemsServer";
import { AdminView } from "./AdminView";

export const metadata = { title: "Admin — Fitch" };

export default async function AdminPage() {
  const problems = await getProblems();
  return <AdminView problemIds={problems.map((p) => p.id)} />;
}
