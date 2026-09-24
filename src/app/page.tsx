import { redirect } from "next/navigation";

import LoginForm from "@/app/login-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (session?.role === "candidate") redirect("/book");
  if (session?.role === "controller") redirect("/schedule");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Panel Slots
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Interview panel scheduling and slot allocation
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
