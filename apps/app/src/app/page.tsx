import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Dashboard } from "./dashboard";

// Server component: the session check happens before any client JS runs,
// so an unauthenticated request never sees even a flash of the dashboard
// shell — it's redirected server-side.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <Dashboard userName={session.user.name} userEmail={session.user.email} />;
}
