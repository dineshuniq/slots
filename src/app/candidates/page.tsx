import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import CandidatesBoard from "@/components/candidates-board";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "controller") redirect("/book");

  return (
    <>
      <AppHeader role="controller" displayName={session.name} />
      <CandidatesBoard />
    </>
  );
}
