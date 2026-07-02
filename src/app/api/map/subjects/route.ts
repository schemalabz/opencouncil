import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getRealm } from '@/lib/realm.server'

// Disable caching for dynamic queries with different filters
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const realm = await getRealm();

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const monthsBackParam = searchParams.get('monthsBack');
        const daysBackParam = searchParams.get('daysBack');
        const topicIdsParam = searchParams.get('topicIds');

        const monthsBack = monthsBackParam ? parseInt(monthsBackParam) : 6;
        // daysBack takes precedence over monthsBack when both are given
        const daysBack = daysBackParam ? parseInt(daysBackParam) : null;
        // allTime=true disables the date filter entirely
        const allTime = searchParams.get('allTime') === 'true';
        const topicIds = topicIdsParam ? topicIdsParam.split(',') : [];
        // Filter-pane params
        const cityIds = (searchParams.get('cityIds') || '').split(',').filter(Boolean);
        const bodyTypes = (searchParams.get('bodyType') || '').split(',').filter(Boolean);
        const dateFromParam = searchParams.get('dateFrom');
        const dateToParam = searchParams.get('dateTo');

        // Calculate date threshold for the quick range
        const dateThreshold = new Date();
        if (daysBack && daysBack > 0) {
            dateThreshold.setDate(dateThreshold.getDate() - daysBack);
        } else {
            dateThreshold.setMonth(dateThreshold.getMonth() - monthsBack);
        }

        // Date window: explicit from/to overrides the quick range; allTime disables it.
        let dateTimeFilter: { gte?: Date; lte?: Date } | undefined;
        if (dateFromParam || dateToParam) {
            dateTimeFilter = {};
            if (dateFromParam) dateTimeFilter.gte = new Date(dateFromParam);
            if (dateToParam) dateTimeFilter.lte = new Date(`${dateToParam}T23:59:59.999`);
        } else if (!allTime) {
            dateTimeFilter = { gte: dateThreshold };
        }

        console.log('🔍 API Filter params:', {
            monthsBack,
            daysBack,
            allTime,
            dateFrom: dateFromParam,
            dateTo: dateToParam,
            cityIds,
            bodyTypes,
            topicIdsCount: topicIds.length,
        });

        // Build where clause
        const whereClause: any = {
            locationId: {
                not: null
            },
            // Exclude "before the agenda" (προ ημερησίας) items — keep agenda subjects.
            nonAgendaReason: { not: 'beforeAgenda' },
            councilMeeting: {
                city: {
                    officialSupport: true,
                    realm
                },
                released: true,
                ...(dateTimeFilter && { dateTime: dateTimeFilter }),
                ...(bodyTypes.length > 0 && { administrativeBody: { type: { in: bodyTypes } } })
            }
        };

        // Add topic filter if specified
        if (topicIds.length > 0) {
            whereClause.topicId = {
                in: topicIds
            };
        }

        // Add municipality filter if specified
        if (cityIds.length > 0) {
            whereClause.cityId = {
                in: cityIds
            };
        }

        // Get all subjects from officially supported cities that have locations
        const subjects = await prisma.subject.findMany({
            where: whereClause,
            include: {
                councilMeeting: {
                    select: {
                        dateTime: true,
                        name: true,
                        administrativeBody: { select: { name: true, type: true } }
                    }
                },
                topic: {
                    select: {
                        name: true,
                        name_en: true,
                        colorHex: true,
                        icon: true
                    }
                },
                location: {
                    select: {
                        text: true,
                        type: true
                    }
                },
                speakerSegments: {
                    select: {
                        speakerSegment: {
                            select: {
                                startTimestamp: true,
                                endTimestamp: true,
                                speakerTag: {
                                    select: {
                                        id: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // Get geometries for all locations
        const locationIds = subjects.map(s => s.locationId).filter(Boolean) as string[];

        if (locationIds.length === 0) {
            return NextResponse.json([]);
        }

        const geometries = await prisma.$queryRaw<
            { id: string; geometry: string }[]
        >`
            SELECT 
                id,
                ST_AsGeoJSON(coordinates, 15, 0)::text AS geometry
            FROM "Location"
            WHERE id IN (${Prisma.join(locationIds)})
        `;

        // Create a map of location id to geometry
        // Fix coordinate order: PostGIS might return [lat, lon] but GeoJSON needs [lon, lat]
        const geometryMap = new Map(
            geometries.map(g => {
                const geom = JSON.parse(g.geometry);
                // Swap coordinates if it's a Point
                if (geom.type === 'Point' && geom.coordinates.length === 2) {
                    // Check if coordinates seem to be in [lat, lon] order (lat > lon for Greece)
                    const [first, second] = geom.coordinates;
                    if (first > 30 && first < 42 && second > 19 && second < 30) {
                        // Likely [lat, lon], swap to [lon, lat]
                        geom.coordinates = [second, first];
                    }
                }
                return [g.id, geom];
            })
        );

        // Combine subjects with their geometries
        const subjectsWithGeometry = subjects
            .filter(s => s.locationId && geometryMap.has(s.locationId))
            .map(s => {
                // Calculate discussion time (in seconds) and unique speakers
                const speakerSegments = s.speakerSegments || [];
                const totalTimeSeconds = speakerSegments.reduce((sum, sss) => {
                    const duration = sss.speakerSegment.endTimestamp - sss.speakerSegment.startTimestamp;
                    return sum + duration;
                }, 0);

                const uniqueSpeakerIds = new Set(
                    speakerSegments.map(sss => sss.speakerSegment.speakerTag.id)
                );

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
                    locationText: s.location?.text,
                    locationType: s.location?.type,
                    topicId: s.topicId,
                    topicName: s.topic?.name,
                    topicColor: s.topic?.colorHex || '#627BBC',
                    topicIcon: s.topic?.icon,
                    discussionTimeSeconds: Math.round(totalTimeSeconds),
                    speakerCount: uniqueSpeakerIds.size,
                    geometry: geometryMap.get(s.locationId!)
                };
            });

        console.log('✅ Returning', subjectsWithGeometry.length, 'subjects');
        console.log('📊 Sample dates:', subjectsWithGeometry.slice(0, 3).map(s => ({
            id: s.id,
            date: s.meetingDate,
            topic: s.topicName
        })));

        return NextResponse.json(subjectsWithGeometry);
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}

