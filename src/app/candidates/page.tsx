import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import CandidatesBoard from "@/components/candidates-board";
import SetupNotice from "@/components/setup-notice";
import { listPanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import type { Panel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "controller") redirect("/book");

  let panels: Panel[] = [];

  try {
    panels = await listPanels();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : "Unknown error."}
      />
    );
  }

  if (panels.length === 0) {
    return (
      <SetupNotice message="No panels have been created yet. Run the seed script." />
    );
  }

  return (
    <>
      <AppHeader role="controller" displayName={session.name} />
      <CandidatesBoard panels={panels} />
    </>
  );
}
