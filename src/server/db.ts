import { PrismaClient } from "@prisma/client";

const globalForDatabase = globalThis as unknown as {
  higannaDatabase?: PrismaClient;
};

/**
 * Shared server-only Prisma client.
 *
 * Reusing one client prevents hot reloads from creating a new MySQL connection
 * pool on every development refresh. Do not import this module into client
 * components.
 */
export const db =
  globalForDatabase.higannaDatabase ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.higannaDatabase = db;
}
