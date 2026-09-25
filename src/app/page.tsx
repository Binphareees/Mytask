import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const taskCount = await prisma.task.count();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">MyTask</h1>
      <p className="text-zinc-600">
        Foundation is wired up. Task features are not implemented yet.
      </p>
      <dl className="mt-4 grid gap-2 rounded-lg border border-zinc-200 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-600">Database connection</dt>
          <dd className="font-mono">OK</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-600">Tasks in database</dt>
          <dd className="font-mono">{taskCount}</dd>
        </div>
      </dl>
    </main>
  );
}
