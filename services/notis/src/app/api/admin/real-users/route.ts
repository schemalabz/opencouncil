import { NextRequest, NextResponse } from "next/server";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { requireAdmin } from "@/lib/session-auth";

/**
 * Real users for the playground picker, from the notis_fanout_targets view —
 * one entry per user, cities carrying Greek topic labels and locations with
 * their coordinates (the view emits geometry centroids), so the wizard can
 * seed the CityPreference shape AND pin the map. Exposes notisEnabledAt so
 * the picker can badge who is on the rollout; it never filters on it (the
 * playground may simulate anyone).
 */

interface RealUserLocation {
  text: string;
  lng: number | null;
  lat: number | null;
}

interface RealUserCity {
  cityId: string;
  cityName: string;
  topics: string[];
  locations: RealUserLocation[];
}

interface RealUser {
  userId: string;
  name: string | null;
  phone: string | null;
  notisEnabledAt: string | null;
  cities: RealUserCity[];
}

function topicNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).name : null,
    )
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function locationPoints(value: unknown): RealUserLocation[] {
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
    .filter((v): v is RealUserLocation => v !== null);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!hasMainDb()) {
    return NextResponse.json({ available: false, users: [] });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const where = q
    ? {
        OR: [
          { userName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
        ],
      }
    : undefined;

  // Cap by USER, then fetch every row of the selected users — a row-level cap
  // would silently truncate a multi-city user's preferences.
  const userRows = await mainDb().fanoutTargetRow.findMany({
    where,
    distinct: ["userId"],
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { userId: true },
  });
  if (userRows.length === 0) {
    return NextResponse.json({ available: true, users: [] });
  }
  const rows = await mainDb().fanoutTargetRow.findMany({
    where: { userId: { in: userRows.map((r) => r.userId) } },
    orderBy: { cityId: "asc" },
  });

  // Initialize in recency order so grouping preserves it.
  const byUser = new Map<string, RealUser>();
  for (const row of rows) {
    const user = byUser.get(row.userId) ?? {
      userId: row.userId,
      name: row.userName,
      phone: row.phone,
      notisEnabledAt: row.notisEnabledAt?.toISOString() ?? null,
      cities: [],
    };
    user.cities.push({
      cityId: row.cityId,
      cityName: row.cityName,
      topics: topicNames(row.topics),
      locations: locationPoints(row.locations),
    });
    byUser.set(row.userId, user);
  }
  const users = userRows
    .map((r) => byUser.get(r.userId))
    .filter((u): u is RealUser => u !== undefined);

  return NextResponse.json({ available: true, users });
}
