import { TaskForm } from "@/components/TaskForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const taskCount = await prisma.task.count();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          MyTask
        </h1>
        <p className="text-sm text-zinc-600">Add a new task</p>
      </div>

      <TaskForm />

      <p aria-live="polite" className="text-sm text-zinc-500">
        Tasks in database: <span className="font-mono">{taskCount}</span>
      </p>
    </main>
  );
}
