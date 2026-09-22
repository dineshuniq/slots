import { redirect } from "next/navigation";

import AppHeader from "@/components/app-header";
import MockBoard from "@/components/mock-board";
import { getSession } from "@/lib/session";
import { buildDateWindow, todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MockPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "controller") redirect("/book");

  return (
    <>
      <AppHeader role="controller" displayName={session.name} />
      <MockBoard days={buildDateWindow()} today={todayKey()} />
    </>
  );
}
