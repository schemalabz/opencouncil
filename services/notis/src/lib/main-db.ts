import { PrismaClient as MainViewsClient } from "../../generated/main-client";
import { env } from "@/env.mjs";

/**
 * Read access to the main database's notis_* views, connected as a login user
 * in the notis_reader role (SELECT on the five views, nothing else). Optional:
 * without MAIN_DATABASE_URL cookie auth fails closed and the playground hides
 * the real-user picker.
 */

const globalForMainDb = globalThis as unknown as { notisMainDb?: MainViewsClient };

export function hasMainDb(): boolean {
  return Boolean(env.MAIN_DATABASE_URL);
}

export function mainDb(): MainViewsClient {
  if (!env.MAIN_DATABASE_URL) {
    throw new Error("MAIN_DATABASE_URL is not set — guard callers with hasMainDb()");
  }
  globalForMainDb.notisMainDb ??= new MainViewsClient({ datasourceUrl: env.MAIN_DATABASE_URL });
  return globalForMainDb.notisMainDb;
}
