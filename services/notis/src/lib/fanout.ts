import type { FanoutTargetRow } from "../../generated/main-client";
import { CityPreference } from "@/agent/types";
import { mainDb } from "@/lib/main-db";
import { normalizePhone } from "@/lib/phone";

/**
 * Readers of the notis_fanout_targets and notis_users views. The views'
 * topics/locations columns are loosely-typed Json; the converters here are
 * the one place that turns them into the CityPreference shape wake assembly
 * and the playground wizard consume.
 */

export interface FanoutLocation {
  text: string;
  lng: number | null;
  lat: number | null;
}

export function topicNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).name : null,
    )
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function locationPoints(value: unknown): FanoutLocation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const { text, lng, lat } = entry as Record<string, unknown>;
      if (typeof text !== "string" || text.length === 0) return null;
      return {
        text,
        lng: typeof lng === "number" ? lng : null,
        lat: typeof lat === "number" ? lat : null,
      };
    })
    .filter((v): v is FanoutLocation => v !== null);
}

export function toCityPreferences(rows: FanoutTargetRow[]): CityPreference[] {
  return rows.map((row) => ({
    cityId: row.cityId,
    cityName: row.cityName,
    topics: topicNames(row.topics),
    locations: locationPoints(row.locations).map(({ text, lng, lat }) => ({
      text,
      ...(lng !== null && lat !== null ? { lng, lat } : {}),
    })),
  }));
}

/**
 * Live city preferences for one user, straight from the view — the
 * subscription's `cities` snapshot is only a fallback for when the main
 * database is unreachable.
 */
export async function citiesForUser(userId: string): Promise<CityPreference[]> {
  const rows = await mainDb().fanoutTargetRow.findMany({
    where: { userId },
    orderBy: { cityId: "asc" },
  });
  return toCityPreferences(rows);
}

/**
 * The inbound gate: the rollout-enabled user this phone belongs to, or null.
 * Stored phone formats are mixed (E.164-ish with or without '+'), so the
 * lookup tolerates both — same approach as the main app's message queries.
 */
export async function findEnabledUserByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return mainDb().notisUserRow.findFirst({
    where: {
      phone: { in: [normalized, normalized.slice(1)] },
      notisEnabledAt: { not: null },
    },
  });
}
