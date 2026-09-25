-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Task" ("completedAt", "createdAt", "description", "dueDate", "id", "priority", "status", "title", "updatedAt") SELECT "completedAt", "createdAt", "description", "dueDate", "id", "priority", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");
CREATE INDEX "Task_status_dueDate_idx" ON "Task"("status", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
