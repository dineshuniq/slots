import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import ScheduleBoard from "@/components/schedule-board";
import SetupNotice from "@/components/setup-notice";
import { listCandidates, listPanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { buildDateWindow, todayKey } from "@/lib/time";
import type { CandidateSummary, Panel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "controller") redirect("/book");

  let panels: Panel[] = [];
  let candidates: CandidateSummary[] = [];

  try {
    [panels, candidates] = await Promise.all([listPanels(), listCandidates()]);
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : "Unknown error."}
      />
    );
  }

  if (panels.length === 0) {
    return <SetupNotice message="No panels have been created yet. Run the seed script." />;
  }

  return (
    <>
      <AppHeader role="controller" displayName={session.name} />
      <ScheduleBoard
        panels={panels}
        candidates={candidates}
        days={buildDateWindow()}
        today={todayKey()}
      />
    </>
  );
}
