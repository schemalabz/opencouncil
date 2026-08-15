import { NextRequest, NextResponse } from "next/server";
import { CityPreference } from "@/agent/types";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { requireAdmin } from "@/lib/session-auth";

/**
 * Real users for the playground picker, from the notis_fanout_targets view —
 * one entry per user, cities carrying Greek topic labels and location texts
 * in the CityPreference shape the wake state uses. Exposes notisEnabledAt so
 * the picker can badge who is on the rollout; it never filters on it (the
 * playground may simulate anyone).
 */

interface RealUser {
  userId: string;
  name: string | null;
  phone: string | null;
  notisEnabledAt: string | null;
  cities: CityPreference[];
}

function jsonNames(value: unknown, key: "name" | "text"): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>)[key] : null,
    )
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!hasMainDb()) {
    return NextResponse.json({ available: false, users: [] });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rows = await mainDb().fanoutTargetRow.findMany({
    where: q
      ? {
          OR: [
            { userName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: [{ updatedAt: "desc" }, { cityId: "asc" }],
    take: 300,
  });

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
      topics: jsonNames(row.topics, "name"),
      locations: jsonNames(row.locations, "text"),
    });
    byUser.set(row.userId, user);
  }

  return NextResponse.json({ available: true, users: Array.from(byUser.values()).slice(0, 50) });
}
