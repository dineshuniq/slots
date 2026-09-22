import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import AuditBoard from "@/components/audit-board";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "controller") redirect("/book");

  return (
    <>
      <AppHeader role="controller" displayName={session.name} />
      <AuditBoard />
    </>
  );
}
