import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Raw-SQL building blocks re-exported beside the client so the query
 * layer's raw paths import them from the same place. Both are the generated
 * client's own runtime helpers (sql-template-tag), not hand-rolled: `sql`
 * builds a parameterized fragment (interpolated values become bound
 * parameters, never string-concatenated SQL), and `join` glues fragments
 * with a separator fragment.
 */
export const sql = Prisma.sql;
export const sqlJoin = Prisma.join;

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
