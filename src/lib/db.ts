import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * The parameterized SQL template tag, re-exported beside the client so the
 * query layer's one raw-SQL path (the priority sort, which needs a CASE
 * expression the typed orderBy input cannot express) imports both from the
 * same place. Values interpolated into this tag become bound parameters,
 * never string-concatenated SQL. It is the generated client's own re-export
 * of sql-template-tag (Prisma.sql), not a hand-rolled type.
 */
export const sql = Prisma.sql;

const createPrismaClient = () => {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  });

  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
