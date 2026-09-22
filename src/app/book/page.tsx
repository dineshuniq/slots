import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import BookingBoard from "@/components/booking-board";
import SetupNotice from "@/components/setup-notice";
import { listCandidates, listPanels } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { buildDateWindow, todayKey } from "@/lib/time";
import type { CandidateSummary, Panel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const session = await getSession();
  if (!session) redirect("/");

  let panels: Panel[] = [];
  let candidates: CandidateSummary[] = [];

  try {
    // Controllers book on someone's behalf, so they need the roster too.
    [panels, candidates] =
      session.role === "controller"
        ? await Promise.all([listPanels(), listCandidates()])
        : [await listPanels(), []];
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
      <AppHeader role={session.role} displayName={session.name} />
      <BookingBoard
        role={session.role}
        panels={panels}
        candidates={candidates}
        days={buildDateWindow()}
        today={todayKey()}
      />
    </>
  );
}
