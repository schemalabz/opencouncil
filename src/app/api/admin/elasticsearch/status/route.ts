import { Client } from '@elastic/elasticsearch';
import { env } from '@/env.mjs';
import { NextResponse } from 'next/server';
import { getCities } from '@/lib/db/cities';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

// This prevents Next.js from trying to statically pre-render this route
export const dynamic = 'force-dynamic';

const client = new Client({
    node: env.ELASTICSEARCH_URL,
    auth: {
        apiKey: env.ELASTICSEARCH_API_KEY
    }
});

interface CityPostgresData {
    cityId: string;
    cityName: string;
    latestMeetingIdPostgres: string | null;
    totalMeetingsPostgres: number;
    status: 'pending' | 'unlisted' | 'listed';
}

export async function GET() {
    try {
        await withUserAuthorizedToEdit({});

        // 1. Fetch data from PostgreSQL
        const citiesFromDb = await getCities({ includeUnlisted: true });

        const totalMeetingsCounts = await prisma.councilMeeting.groupBy({
            by: ['cityId'],
            _count: { _all: true },
            where: { 
                cityId: { in: citiesFromDb.map(c => c.id) },
                released: true
            },
        });

        const latestMeetings = await prisma.councilMeeting.findMany({
            distinct: ['cityId'],
            where: {
                cityId: { in: citiesFromDb.map(c => c.id) },
                released: true
            },
            orderBy: [
                { cityId: 'asc' },
                { dateTime: 'desc' },
                { createdAt: 'desc' },
            ],
            select: {
                id: true,
                cityId: true,
            }
        });

        const postgresData: Record<string, CityPostgresData> = {};
        for (const city of citiesFromDb) {
            const latestMeeting = latestMeetings.find(m => m.cityId === city.id);
            const meetingsCount = totalMeetingsCounts.find(c => c.cityId === city.id);
            postgresData[city.id] = {
                cityId: city.id,
                cityName: city.name,
                latestMeetingIdPostgres: latestMeeting?.id || null,
                totalMeetingsPostgres: meetingsCount?._count._all || 0,
                status: city.status,
            };
        }

        // 2. Fetch data from Elasticsearch
        const esResponse = await client.search({
            index: 'subjects',
            size: 0,
            aggs: {
                last_sync_info: {
                    top_hits: {
                        size: 1,
                        sort: [{ '_timestamp': { order: 'desc' } }],
                        _source: ['_timestamp', 'database']
                    }
                },
                cities: {
                    terms: {
                        field: 'public_subject_city_id',
                        size: citiesFromDb.length || 100
                    },
                    aggs: {
                        latest_meeting: {
                            top_hits: {
                                size: 1,
                                sort: [{ 'public_subject_meeting_date': { order: 'desc' } }],
                                _source: ['public_subject_councilmeeting_id']
                            }
                        },
                        total_meetings: {
                            cardinality: {
                                field: "public_subject_councilmeeting_id.keyword"
                            }
                        }
                    }
                }
            }
        });

        const lastSyncHit = (esResponse.aggregations?.last_sync_info as any)?.hits.hits[0];
        const lastSync = lastSyncHit?._source?._timestamp;
        const database = lastSyncHit?._source?.database;
        const esCityBuckets = (esResponse.aggregations?.cities as any)?.buckets || [];

        // 3. Merge data
        const mergedStatus = Object.values(postgresData).map(pgCity => {
            const esCity = esCityBuckets.find((b: any) => b.key === pgCity.cityId);
            const latestMeetingHit = esCity?.latest_meeting.hits.hits[0];
            const source = latestMeetingHit?._source;
            
            return {
                ...pgCity,
                latestMeetingIdElastic: source?.public_subject_councilmeeting_id || null,
                totalMeetingsElastic: esCity?.total_meetings.value || 0,
                totalSubjectsElastic: esCity?.doc_count || 0,
                isInElastic: !!esCity,
            };
        });

        return NextResponse.json({
            lastSync,
            database,
            cities: mergedStatus.sort((a, b) => a.cityName.localeCompare(b.cityName)),
        });

    } catch (error) {
        console.error('Error fetching Elasticsearch status:', error);
        if (error instanceof Error && error.message.includes("Not authorized")) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        return NextResponse.json({ error: 'Failed to fetch Elasticsearch status' }, { status: 500 });
    }
} 