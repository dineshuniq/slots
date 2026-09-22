export default function SetupNotice({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">
          Database not reachable
        </h1>
        <p className="mt-2 text-sm text-amber-800">{message}</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-amber-800">
          <li>
            Copy <code className="rounded bg-amber-100 px-1">.env.example</code>{" "}
            to <code className="rounded bg-amber-100 px-1">.env.local</code>.
          </li>
          <li>
            Set <code className="rounded bg-amber-100 px-1">DATABASE_URL</code>{" "}
            to your Neon, Supabase, or local Postgres connection string.
          </li>
          <li>
            Run <code className="rounded bg-amber-100 px-1">npm run db:setup</code>{" "}
            then <code className="rounded bg-amber-100 px-1">npm run db:seed</code>.
          </li>
        </ol>
      </div>
    </main>
  );
}
