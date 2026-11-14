import { getProblems } from "@/lib/problemsServer";
import { ProfileView } from "./ProfileView";

export default async function ProfilePage() {
  return <ProfileView problems={await getProblems()} />;
}
