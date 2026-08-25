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

/**
 * One key per meeting whose summarize event arrived while the meeting was
 * still dated in the future — a data error the poller alarms on. The key
 * makes the alarm fire once instead of every five-minute tick; the event
 * itself stays unconsumed, so correcting the date still fans it out.
 */
export const futureSummaryAlertKey = (cityId: string, meetingId: string) =>
  `futureSummaryAlerted:${cityId}:${meetingId}`;

export async function getProactiveSettings(db: Db): Promise<ProactiveSettings> {
  const row = await db.notisSetting.findUnique({ where: { key: PROACTIVE_PAUSED_KEY } });
  // Absent means paused: deployments start dark on purpose.
  return { paused: row === null ? true : row.value === true };
}

export async function hasSetting(db: Db, key: string): Promise<boolean> {
  return (await db.notisSetting.findUnique({ where: { key } })) !== null;
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
