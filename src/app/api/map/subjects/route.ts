import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

// Disable caching for dynamic queries with different filters
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const monthsBackParam = searchParams.get('monthsBack');
        const topicIdsParam = searchParams.get('topicIds');
        const cityIdsParam = searchParams.get('cityIds');
        const bodyTypesParam = searchParams.get('bodyTypes');

        const monthsBack = monthsBackParam ? parseInt(monthsBackParam) : 6;
        const topicIds = topicIdsParam ? topicIdsParam.split(',') : [];
        const cityIds = cityIdsParam ? cityIdsParam.split(',') : [];
        const bodyTypes = bodyTypesParam ? bodyTypesParam.split(',') : [];

        if (process.env.NODE_ENV === 'development') {
            console.log('🔍 API Filter params:', {
                monthsBack,
                topicIdsCount: topicIds.length,
                cityIdsCount: cityIds.length,
                bodyTypes: bodyTypes,
                topicIdsParam,
                cityIdsParam,
                bodyTypesParam
            });
        }

        // Calculate date threshold
        const dateThreshold = new Date();
        dateThreshold.setMonth(dateThreshold.getMonth() - monthsBack);

        // Build where clause with proper Prisma types
        const whereClause: Prisma.SubjectWhereInput = {
            locationId: {
                not: null
            },
            councilMeeting: {
                city: {
                    officialSupport: true
                },
                released: true,
                dateTime: {
                    gte: dateThreshold
                }
            }
        };

        // Add city filter if specified
        if (cityIds.length > 0) {
            if (!whereClause.councilMeeting) {
                whereClause.councilMeeting = {};
            }
            whereClause.councilMeeting.cityId = {
                in: cityIds
            };
        }

        // Add topic filter if specified
        if (topicIds.length > 0) {
            whereClause.topicId = {
                in: topicIds
            };
        }

        // Add body type filter if specified
        if (bodyTypes.length > 0) {
            if (!whereClause.councilMeeting) {
                whereClause.councilMeeting = {};
            }
            whereClause.councilMeeting.administrativeBody = {
                type: {
                    in: bodyTypes as any[]
                }
            };
        }

        // Get all subjects from officially supported cities that have locations
        const subjects = await prisma.subject.findMany({
            where: whereClause,
            include: {
                councilMeeting: {
                    select: {
                        dateTime: true,
                        name: true
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
        // PostGIS coordinate fix: Some historical data has coordinates stored as [lat, lng]
        // but GeoJSON spec requires [lng, lat]. This heuristic detects and fixes the swap
        // using Greece's geographic bounds:
        // - Latitude: 34-42°N (first coord > 30 && < 42 suggests it's latitude)
        // - Longitude: 19-30°E (second coord > 19 && < 30 suggests it's longitude)
        const GREECE_LAT_RANGE = [30, 42] as const;
        const GREECE_LNG_RANGE = [19, 30] as const;

        const geometryMap = new Map(
            geometries.map(g => {
                const geom = JSON.parse(g.geometry);
                if (geom.type === 'Point' && geom.coordinates.length === 2) {
                    const [first, second] = geom.coordinates;
                    // If first coordinate looks like latitude, swap to [lng, lat]
                    if (first > GREECE_LAT_RANGE[0] && first < GREECE_LAT_RANGE[1] &&
                        second > GREECE_LNG_RANGE[0] && second < GREECE_LNG_RANGE[1]) {
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
                    locationText: s.location?.text,
                    locationType: s.location?.type,
                    topicName: s.topic?.name,
                    topicColor: s.topic?.colorHex || '#627BBC',
                    topicIcon: s.topic?.icon,
                    discussionTimeSeconds: Math.round(totalTimeSeconds),
                    speakerCount: uniqueSpeakerIds.size,
                    geometry: geometryMap.get(s.locationId!)
                };
            });

        return NextResponse.json(subjectsWithGeometry);
    } catch (error) {
        console.error('Error fetching subjects for map:', error);
        return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }
}
