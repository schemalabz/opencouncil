import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { AdministrativeBodyType, Prisma } from '@prisma/client'
import { getRealm } from '@/lib/realm.server'

// Subjects without a location can't be placed on the map as points. This endpoint groups
// them per municipality and returns each city's centroid, so the landing can show one
// "general subjects" (city-hall) marker per δήμος. Same date/filter params as
// /api/map/subjects, so the two stay in sync as the user changes the range/filters.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const realm = await getRealm();
        const { searchParams } = new URL(request.url);

        const monthsBack = searchParams.get('monthsBack') ? parseInt(searchParams.get('monthsBack')!) : 6;
        const daysBack = searchParams.get('daysBack') ? parseInt(searchParams.get('daysBack')!) : null;
        const allTime = searchParams.get('allTime') === 'true';
        const topicIds = (searchParams.get('topicIds') || '').split(',').filter(Boolean);
        const cityIds = (searchParams.get('cityIds') || '').split(',').filter(Boolean);
        const bodyTypes = (searchParams.get('bodyType') || '')
            .split(',')
            .filter((b): b is AdministrativeBodyType =>
                (Object.values(AdministrativeBodyType) as string[]).includes(b),
            );
        const dateFromParam = searchParams.get('dateFrom');
        const dateToParam = searchParams.get('dateTo');

        const dateThreshold = new Date();
        if (daysBack && daysBack > 0) {
            dateThreshold.setDate(dateThreshold.getDate() - daysBack);
        } else {
            dateThreshold.setMonth(dateThreshold.getMonth() - monthsBack);
        }

        let dateTimeFilter: { gte?: Date; lte?: Date } | undefined;
        if (dateFromParam || dateToParam) {
            dateTimeFilter = {};
            if (dateFromParam) dateTimeFilter.gte = new Date(dateFromParam);
            if (dateToParam) dateTimeFilter.lte = new Date(`${dateToParam}T23:59:59.999`);
        } else if (!allTime) {
            dateTimeFilter = { gte: dateThreshold };
        }

        const whereClause: Prisma.SubjectWhereInput = {
            locationId: null,
            // Exclude "before the agenda" (προ ημερησίας) items — keep agenda subjects.
            nonAgendaReason: { not: 'beforeAgenda' },
            councilMeeting: {
                city: { officialSupport: true, realm },
                released: true,
                ...(dateTimeFilter && { dateTime: dateTimeFilter }),
                ...(bodyTypes.length > 0 && { administrativeBody: { type: { in: bodyTypes } } }),
            },
            ...(topicIds.length > 0 && { topicId: { in: topicIds } }),
            ...(cityIds.length > 0 && { cityId: { in: cityIds } }),
        };

        const subjects = await prisma.subject.findMany({
            where: whereClause,
            include: {
                councilMeeting: { select: { dateTime: true, name: true, administrativeBody: { select: { name: true, type: true } } } },
                topic: { select: { name: true, colorHex: true, icon: true } },
                speakerSegments: {
                    select: {
                        speakerSegment: {
                            select: {
                                startTimestamp: true,
                                endTimestamp: true,
                                speakerTag: { select: { id: true } },
                            },
                        },
                    },
                },
            },
        });

        if (subjects.length === 0) return NextResponse.json([]);

        // Group subjects by city.
        const byCity = new Map<string, typeof subjects>();
        for (const s of subjects) {
            const list = byCity.get(s.cityId);
            if (list) list.push(s);
            else byCity.set(s.cityId, [s]);
        }

        // One centroid per city (PostGIS; City geometry is SRID 4326 → ST_X=lng, ST_Y=lat).
        const centroids = await prisma.$queryRaw<{ id: string; name: string; lng: number; lat: number }[]>`
            SELECT id, name,
                   ST_X(ST_Centroid(geometry)) AS lng,
                   ST_Y(ST_Centroid(geometry)) AS lat
            FROM "City"
            WHERE id IN (${Prisma.join([...byCity.keys()])}) AND geometry IS NOT NULL
        `;
        const centroidMap = new Map(centroids.map((c) => [c.id, c]));

        const result = [...byCity.entries()]
            .map(([cityId, subs]) => {
                const c = centroidMap.get(cityId);
                if (!c) return null; // city without geometry → can't place a marker
                return {
                    cityId,
                    cityName: c.name,
                    lng: Number(c.lng),
                    lat: Number(c.lat),
                    subjects: subs.map((s) => {
                        const segs = s.speakerSegments || [];
                        const secs = segs.reduce(
                            (sum, sss) => sum + (sss.speakerSegment.endTimestamp - sss.speakerSegment.startTimestamp),
                            0,
                        );
                        const speakers = new Set(segs.map((sss) => sss.speakerSegment.speakerTag.id)).size;
                        return {
                            id: s.id,
                            name: s.name,
                            description: s.description,
                            cityId: s.cityId,
                            councilMeetingId: s.councilMeetingId,
                            meetingDate: s.councilMeeting?.dateTime?.toISOString(),
                            meetingName: s.councilMeeting?.name,
                            bodyName: s.councilMeeting?.administrativeBody?.name ?? null,
                            adminBodyType: s.councilMeeting?.administrativeBody?.type ?? null,
                            topicId: s.topicId,
                            topicName: s.topic?.name,
                            topicColor: s.topic?.colorHex || '#627BBC',
                            topicIcon: s.topic?.icon,
                            discussionTimeSeconds: Math.round(secs),
                            speakerCount: speakers,
                        };
                    }),
                };
            })
            .filter(Boolean);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching general (non-located) subjects:', error);
        return NextResponse.json({ error: 'Failed to fetch general subjects' }, { status: 500 });
    }
}
