import { PrismaClient } from "../../generated/client";
import { env } from "@/env.mjs";

/**
 * Notis's own database. Optional by design: without NOTIS_DATABASE_URL the
 * service runs in the stateless playground-only mode — callers gate on
 * hasNotisDb() and fall back to honest zeros.
 */

const globalForDb = globalThis as unknown as { notisDb?: PrismaClient };

export function hasNotisDb(): boolean {
  return Boolean(env.NOTIS_DATABASE_URL);
}

export function notisDb(): PrismaClient {
  if (!env.NOTIS_DATABASE_URL) {
    throw new Error("NOTIS_DATABASE_URL is not set — guard callers with hasNotisDb()");
  }
  // Reuse across dev hot reloads, same pattern as the main app's prisma singleton.
  globalForDb.notisDb ??= new PrismaClient({ datasourceUrl: env.NOTIS_DATABASE_URL });
  return globalForDb.notisDb;
}
