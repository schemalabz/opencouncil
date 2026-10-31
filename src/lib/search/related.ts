import { estypes } from '@elastic/elasticsearch';
import type { AdministrativeBodyType } from '@prisma/client';
import { env } from '@/env.mjs';
import { SECONDARY_BODY_TYPES, bodyTier } from '@/lib/utils/bodyTier';
import type { RelatedScope } from './types';
import { subjectVisibilityFilters } from './query';
import { DEFAULT_SCORE_PROFILE, type QueryProfile } from './profile';

/** What the related-subjects query needs to know about the subject on screen. */
export interface RelatedSubjectSeed {
    id: string;
    name: string;
    cityId: string;
    councilMeetingId: string;
    /** The type of the body that held the meeting; null for a meeting with no body. */
    administrativeBodyType: AdministrativeBodyType | null;
}

/**
 * The tier clause of the related query (see bodyTier.ts). A municipal
 * subject never relates to a secondary body's. A secondary body's subject
 * relates to every body of its own municipality, and to the same kind of
 * body in the other municipalities.
 */
function relatedTierFilters(seed: RelatedSubjectSeed, scope: RelatedScope): estypes.QueryDslQueryContainer[] {
    if (bodyTier(seed.administrativeBodyType) === 'primary') {
        return [{ bool: { must_not: [{ terms: { administrative_body_type: [...SECONDARY_BODY_TYPES] } }] } }];
    }
    return scope === 'other' ? [{ term: { administrative_body_type: seed.administrativeBodyType! } }] : [];
}

/** How many related subjects a subject page shows per scope. */
export const RELATED_SUBJECTS_SIZE = 5;

/**
 * Similarity floor (normalized cosine, 0-1) for a related subject, for the
 * model the schema names. The floor belongs to the embedding model, so it is
 * part of the ScoreProfile (./profile.ts, with the measurements); the runtime
 * passes the live index's profile to buildRelatedSubjectsQuery, and this
 * default serves callers without one. A subject with no neighbour above the floor gets
 * an empty list, and the page shows no section at all, which beats padding
 * one with whatever is least far away.
 */
export const RELATED_MIN_SIMILARITY = DEFAULT_SCORE_PROFILE.relatedMinSimilarity;

/** The municipalities one scope searches, out of the realm's `cityIds`. */
export function relatedScopeCityIds(seed: RelatedSubjectSeed, scope: RelatedScope, cityIds: string[]): string[] {
    return scope === 'city'
        ? cityIds.filter(id => id === seed.cityId)
        : cityIds.filter(id => id !== seed.cityId);
}

/**
 * The subjects most similar to one subject, as one Elasticsearch request.
 *
 * Deliberately NOT the search page's query (buildSearchQuery). That query is
 * tuned for what a person types: its coverage gate wants most of the query's
 * terms in a document, so a two-word title finds almost nothing, and its
 * semantic arm sits behind a cutoff measured for typed queries. Here the title
 * is the whole query and only the meaning-based fields answer it. Measured
 * against the production index, that found the recurring agenda items of the
 * same municipality and the same programmes in other municipalities, where
 * more_like_this surfaced subjects that merely share municipal vocabulary.
 *
 * `cityIds` is the realm's municipalities, already capped by the caller. The
 * `city` scope narrows to the seed's own municipality; `other` drops it. The
 * city filter is always present, even when it is empty: an absent filter
 * would search every realm, and an empty `terms` matches nothing, which is
 * the right answer for a realm with no other municipality.
 */
export function buildRelatedSubjectsQuery(
    seed: RelatedSubjectSeed,
    scope: RelatedScope,
    cityIds: string[],
    profile: QueryProfile = DEFAULT_SCORE_PROFILE
): estypes.SearchRequest {
    const scopeCityIds = relatedScopeCityIds(seed, scope, cityIds);

    return {
        index: profile.index ?? env.ELASTICSEARCH_INDEX,
        size: RELATED_SUBJECTS_SIZE,
        track_total_hits: false,
        _source: ['id'],
        min_score: profile.relatedMinSimilarity,
        query: {
            bool: {
                must: [{
                    dis_max: {
                        queries: [
                            { semantic: { field: 'name.semantic', query: seed.name } },
                            { semantic: { field: 'description.semantic', query: seed.name } },
                        ],
                        // Pure max: the score is how close the closest field
                        // is, so a title match is not diluted by a summary
                        // that says more than the title.
                        tie_breaker: 0,
                    },
                }],
                filter: [
                    ...subjectVisibilityFilters(),
                    { terms: { city_id: scopeCityIds } },
                    ...relatedTierFilters(seed, scope),
                ],
                // The subject itself, and its siblings from the same meeting:
                // the meeting page already lists those. A meeting id is a
                // date, unique only within its municipality, so the sibling
                // clause names the (city, meeting) pair: on its own it would
                // also drop every other municipality's meeting of that day.
                must_not: [
                    { term: { id: seed.id } },
                    {
                        bool: {
                            filter: [
                                { term: { city_id: seed.cityId } },
                                { term: { councilMeeting_id: seed.councilMeetingId } },
                            ],
                        },
                    },
                ],
            },
        },
    };
}
