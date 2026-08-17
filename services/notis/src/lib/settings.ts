import { hasNotisDb, notisDb } from "@/lib/db";
import type { Db } from "@/lib/queue-core";

/**
 * Server-side operational settings, one row per key in NotisSetting.
 *
 * proactiveMode: "shadow" (default — wakes run and record everything, no
 * proactive Bird call happens) | "live". proactivePaused: the kill switch —
 * a single global pause of all PROACTIVE sends; reactive replies are never
 * gated. Reads are per-wake/per-send PK selects, deliberately uncached: a
 * flip must bite immediately, mid-drain.
 */

export type ProactiveMode = "shadow" | "live";

export interface ProactiveSettings {
  mode: ProactiveMode;
  paused: boolean;
}

export const PROACTIVE_MODE_KEY = "proactiveMode";
export const PROACTIVE_PAUSED_KEY = "proactivePaused";
export const POLLER_STATUS_KEY = "pollerStatus";

export async function getProactiveSettings(db: Db): Promise<ProactiveSettings> {
  const rows = await db.notisSetting.findMany({
    where: { key: { in: [PROACTIVE_MODE_KEY, PROACTIVE_PAUSED_KEY] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    mode: byKey.get(PROACTIVE_MODE_KEY) === "live" ? "live" : "shadow",
    paused: byKey.get(PROACTIVE_PAUSED_KEY) === true,
  };
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
