import prisma from './prisma';
import type { Realm, AdministrativeBodyType } from '@prisma/client';

/**
 * One coverage row per (cooperating municipality × administrative body type) for
 * the /explain "Κάλυψη" subsection: since when we publicly cover that body type
 * in that city ("από" = its first released meeting) up to now ("έως" = τώρα).
 */
export interface CoverageRow {
    cityId: string;
    cityName: string; // name_municipality, e.g. "Δήμος Αθηναίων"
    bodyType: AdministrativeBodyType; // 'council' | 'committee' | 'community'
    /** ISO date of the first released meeting for this city + body type. */
    fromDate: string;
}

const TYPE_ORDER: Record<AdministrativeBodyType, number> = {
    council: 0,
    committee: 1,
    community: 2,
};

export async function getCityCoverage(realm: Realm): Promise<CoverageRow[]> {
    const cities = await prisma.city.findMany({
        where: {
            realm,
            status: 'listed',
            officialSupport: true,
            councilMeetings: { some: { released: true, administrativeBody: { isNot: null } } },
        },
        select: {
            id: true,
            name_municipality: true,
            councilMeetings: {
                where: { released: true, administrativeBody: { isNot: null } },
                select: {
                    dateTime: true,
                    administrativeBody: { select: { type: true } },
                },
            },
        },
    });

    const rows: CoverageRow[] = [];
    for (const c of cities) {
        // earliest released meeting per body type
        const firstByType = new Map<AdministrativeBodyType, Date>();
        for (const m of c.councilMeetings) {
            const type = m.administrativeBody?.type;
            if (!type) continue;
            const current = firstByType.get(type);
            if (!current || m.dateTime < current) firstByType.set(type, m.dateTime);
        }
        for (const [bodyType, from] of firstByType) {
            rows.push({
                cityId: c.id,
                cityName: c.name_municipality,
                bodyType,
                fromDate: from.toISOString(),
            });
        }
    }

    rows.sort(
        (a, b) =>
            a.cityName.localeCompare(b.cityName, 'el') || TYPE_ORDER[a.bodyType] - TYPE_ORDER[b.bodyType],
    );
    return rows;
}
