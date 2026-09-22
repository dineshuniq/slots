import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import BookingBoard from "@/components/booking-board";
import SetupNotice from "@/components/setup-notice";
import { findPanel, listCandidates, listPanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { buildDateWindow, todayKey } from "@/lib/time";
import type { CandidateSummary, Panel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const session = await getSession();
  if (!session) redirect("/");

  let panels: Panel[] = [];
  let candidates: CandidateSummary[] = [];
  let initialPanelId = "";

  try {
    if (session.role === "candidate") {
      const panel = await findPanel(session.panelId);
      if (!panel) redirect("/");
      panels = [panel];
      initialPanelId = panel.id;
    } else {
      [panels, candidates] = await Promise.all([listPanels(), listCandidates()]);
      initialPanelId = panels[0]?.id ?? "";
    }
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : "Unknown error."}
      />
    );
  }

  if (!initialPanelId) {
    return <SetupNotice message="No panels have been created yet. Run the seed script." />;
  }

  return (
    <>
      <AppHeader role={session.role} displayName={session.name} />
      <BookingBoard
        role={session.role}
        panels={panels}
        initialPanelId={initialPanelId}
        candidates={candidates}
        days={buildDateWindow()}
        today={todayKey()}
      />
    </>
  );
}
