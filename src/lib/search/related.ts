import { Client } from '@elastic/elasticsearch';
import prisma from '@/lib/db/prisma';
import { executeElasticsearchWithRetry } from './retry';
import { RelatedSubjectResult } from './types';
import { env } from '@/env.mjs';

// Initialize Elasticsearch client (singleton pattern matching index.ts)
const client = new Client({
    node: env.ELASTICSEARCH_URL,
    auth: {
        apiKey: env.ELASTICSEARCH_API_KEY
    }
});

export interface FindRelatedSubjectsInput {
    subjectId: string;
    subjectName: string;
    subjectDescription: string | null;
    topicId?: string | null;
}

/**
 * Find subjects related to the given subject using hybrid search (BM25 + semantic kNN via RRF).
 * The source subject is excluded from results. Only released meetings are included.
 * When topicId is provided, subjects with the same topic receive a relevance boost (not a filter).
 *
 * ES _id is the Prisma subject id (confirmed by PGSync schema.json: nodes.table="Subject", no _id remapping).
 *
 * Returns up to 20 results enriched with topic color/icon from DB.
 */
export async function findRelatedSubjects(input: FindRelatedSubjectsInput): Promise<RelatedSubjectResult[]> {
    const { subjectId, subjectName, subjectDescription, topicId } = input;

    // Build the topic boost clause for BM25 arm (used in should when topicId is present)
    const topicBoostClause = topicId
        ? [{ term: { topic_id: { value: topicId, boost: 2.0 } } }]
        : [];

    const response = await executeElasticsearchWithRetry(
        () => client.search({
            index: env.ELASTICSEARCH_INDEX,
            size: 20,
            retriever: {
                rrf: {
                    retrievers: [
                        // Arm 1: BM25 via more_like_this
                        {
                            standard: {
                                query: {
                                    bool: {
                                        must: [
                                            {
                                                more_like_this: {
                                                    fields: ['name', 'description'],
                                                    like: [{ _index: env.ELASTICSEARCH_INDEX, _id: subjectId }],
                                                    min_term_freq: 1,
                                                    min_doc_freq: 1,
                                                    max_query_terms: 25,
                                                }
                                            }
                                        ],
                                        filter: [
                                            { term: { meeting_released: true } },
                                            { bool: { must_not: { term: { _id: subjectId } } } }
                                        ],
                                        ...(topicBoostClause.length > 0 ? { should: topicBoostClause } : {})
                                    }
                                }
                            }
                        },
                        // Arm 2: Semantic kNN
                        {
                            standard: {
                                query: {
                                    bool: {
                                        should: [
                                            {
                                                semantic: {
                                                    query: subjectName,
                                                    field: 'name.semantic',
                                                    boost: 2.0
                                                }
                                            },
                                            ...(subjectDescription
                                                ? [{
                                                    semantic: {
                                                        query: subjectDescription,
                                                        field: 'description.semantic',
                                                        boost: 1.0
                                                    }
                                                }]
                                                : []),
                                            ...topicBoostClause
                                        ],
                                        minimum_should_match: 1,
                                        filter: [
                                            { term: { meeting_released: true } },
                                            { bool: { must_not: { term: { _id: subjectId } } } }
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    rank_window_size: 50,
                    rank_constant: 60
                }
            }
        } as Parameters<typeof client.search>[0]),
        'RelatedSubjects'
    );

    const hits = (response.hits.hits as Array<{
        _id: string;
        _score?: number | null;
        _source?: {
            id?: string;
            name?: string;
            city_id?: string;
            city_name?: string;
            city_name_en?: string;
            meeting_date?: string;
            meeting_name?: string;
            topic_id?: string;
            topic_name?: string;
            topic_name_en?: string;
            councilMeeting_id?: string;
        };
    }>).filter(hit => hit._source);

    if (hits.length === 0) {
        return [];
    }

    // Collect unique topic IDs to enrich with color/icon from DB
    const topicIds = [...new Set(
        hits.map(hit => hit._source?.topic_id).filter((id): id is string => !!id)
    )];

    // Collect unique councilMeeting IDs to get adminBodyId and adminBodyName
    const meetingIds = [...new Set(
        hits.map(hit => hit._source?.councilMeeting_id).filter((id): id is string => !!id)
    )];

    // Parallel DB enrichment queries
    const [topics, meetings] = await Promise.all([
        topicIds.length > 0
            ? prisma.topic.findMany({
                where: { id: { in: topicIds } },
                select: { id: true, colorHex: true, icon: true }
            })
            : Promise.resolve([]),
        meetingIds.length > 0
            ? prisma.councilMeeting.findMany({
                where: { id: { in: meetingIds } },
                select: {
                    id: true,
                    administrativeBodyId: true,
                    administrativeBody: {
                        select: { name: true }
                    }
                }
            })
            : Promise.resolve([])
    ]);

    const topicMap = new Map(topics.map(t => [t.id, t]));
    const meetingMap = new Map(meetings.map(m => [m.id, m]));

    return hits.map(hit => {
        const src = hit._source!;
        const topicData = src.topic_id ? topicMap.get(src.topic_id) : undefined;
        const meetingData = src.councilMeeting_id ? meetingMap.get(src.councilMeeting_id) : undefined;

        return {
            id: src.id ?? hit._id,
            name: src.name ?? '',
            name_en: null, // not indexed in ES schema
            description: null, // avoid returning full description in list view
            topicId: src.topic_id ?? null,
            topicName: src.topic_name ?? null,
            topicColor: topicData?.colorHex ?? null,
            topicIcon: topicData?.icon ?? null,
            meetingDate: src.meeting_date ?? null,
            meetingName: src.meeting_name ?? null,
            cityId: src.city_id ?? '',
            cityName: src.city_name ?? null,
            cityNameEn: src.city_name_en ?? null,
            adminBodyId: meetingData?.administrativeBodyId ?? null,
            adminBodyName: meetingData?.administrativeBody?.name ?? null,
            score: hit._score ?? 0,
        } satisfies RelatedSubjectResult;
    });
}
