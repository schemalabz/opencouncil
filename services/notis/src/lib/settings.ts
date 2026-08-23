import { hasNotisDb, notisDb } from "@/lib/db";
import type { Db } from "@/lib/queue-core";

/**
 * Server-side operational settings, one row per key in NotisSetting.
 *
 * proactivePaused is THE proactive switch: a single global pause of all
 * PROACTIVE sends and enrollments; reactive replies are never gated. It
 * defaults to TRUE when the row is absent, so a fresh deployment lands
 * dark — unpausing after the inbound-only gate IS the launch. Reads are
 * per-wake/per-send PK selects, deliberately uncached: a flip must bite
 * immediately, mid-drain.
 */

export interface ProactiveSettings {
  paused: boolean;
}

export const PROACTIVE_PAUSED_KEY = "proactivePaused";
export const POLLER_STATUS_KEY = "pollerStatus";

export async function getProactiveSettings(db: Db): Promise<ProactiveSettings> {
  const row = await db.notisSetting.findUnique({ where: { key: PROACTIVE_PAUSED_KEY } });
  // Absent means paused: deployments start dark on purpose.
  return { paused: row === null ? true : row.value === true };
}

export async function putSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.notisSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never, updatedAt: new Date() },
  });
}

export async function getSetting(key: string): Promise<unknown> {
  if (!hasNotisDb()) return undefined;
  const row = await notisDb().notisSetting.findUnique({ where: { key } });
  return row?.value;
}
