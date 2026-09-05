import { Client } from '@elastic/elasticsearch';
import { Prisma, Realm } from '@prisma/client';
import prisma from "@/lib/db/prisma";
import { SearchRequest, SearchResponse, SearchResultLight, SearchResultDetailed, SubjectDocument, ExtractedFilters, DerivedFilters } from './types';
import { buildSearchQuery } from './query';
import { extractFilters, processFilters, NO_EXTRACTED_FILTERS } from './filters';
import { sendErrorAdminAlert } from '@/lib/discord';
import { executeElasticsearchWithRetry } from './retry';
import { partitionHits, reportOrphanedHits } from './hits';
import { getCities, filterCityIdsByRealm } from '@/lib/db/cities';
import { logSearchQuery } from '@/lib/db/searchQueries';
import { env } from '@/env.mjs';

// Initialize Elasticsearch client
const client = new Client({
    node: env.ELASTICSEARCH_URL,
    auth: {
        apiKey: env.ELASTICSEARCH_API_KEY
    }
});

// Helper function for essential logs that should always be shown
const logEssential = (message: string, data?: any) => {
    console.log(`[Search Analytics] ${message}`, data || '');
};

// Relations needed to turn a speaker segment into a detailed search result entry
const subjectDiscussionSegmentInclude = {
    meeting: {
        include: {
            city: true
        }
    },
    speakerTag: {
        include: {
            person: {
                include: {
                    roles: {
                        include: {
                            party: true,
                            city: true,
                            administrativeBody: true
                        }
                    }
                }
            }
        }
    },
    utterances: true,
    summary: true
} satisfies Prisma.SpeakerSegmentInclude;

type SubjectDiscussionSegment = Prisma.SpeakerSegmentGetPayload<{ include: typeof subjectDiscussionSegmentInclude }>;

/** One Elasticsearch hit that survived the release re-check, in relevance order.
 *
 * The highlight fragments are the whole field with the matched spans wrapped in
 * sentinel markers (see ./constants), carried across the retrieval/hydration
 * seam because only the query knows what matched. Present only when
 * `config.enableHighlights` asked for them. */
export type SubjectSearchHit = {
    id: string;
    score: number;
    nameHighlight?: string;
    descriptionHighlight?: string;
};

/** What retrieval knows before anything is hydrated. */
export type SubjectSearchHits = {
    hits: SubjectSearchHit[];
    total: number;
    dropped: number;
    derivedFilters: DerivedFilters;
};

/** Log the failure, alert the team, and raise a message that leaks nothing. */
function failSearch(request: SearchRequest, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logEssential('Search Session Failed', {
        query: request.query,
        error: errorMessage,
        filters: {
            cityIds: request.cityIds,
            personIds: request.personIds,
            partyIds: request.partyIds,
            topicIds: request.topicIds,
            dateRange: request.dateRange,
            hasLocations: request.locations ? request.locations.length > 0 : false
        }
    });

    // Notify team via Discord (fire-and-forget)
    sendErrorAdminAlert({
        source: 'Search',
        error: errorMessage,
        context: {
            query: request.query,
            cityIds: request.cityIds?.join(', '),
            personIds: request.personIds?.join(', '),
            partyIds: request.partyIds?.join(', '),
        },
    }).catch(() => {});

    throw new Error('Failed to execute search');
}

/**
 * The realm to search, either resolved already or as a resolver to call. The
 * resolver form exists so that `getRealm()` — which reads the request headers
 * and can therefore fail — runs inside the error handling below, instead of
 * throwing raw past it in the caller's argument list.
 */
export type RealmSource = Realm | (() => Promise<Realm>);

/**
 * Retrieval: everything up to the point where a hit becomes a row. Runs the
 * query, re-checks visibility, and answers with ids in relevance order.
 *
 * Split out from `searchInRealm` because hydration is the expensive half and
 * not every caller wants the shape it produces. A `SearchResultLight` carries
 * the subject's introducer, every contribution with each speaker's roles, its
 * highlights, its decision — the map wants a pin and a card, and would discard
 * nearly all of it. Callers like that hydrate the ids themselves, in whatever
 * shape their surface actually needs.
 *
 * Deliberately NOT a Server Action: the realm decides which tenant's data the
 * search may reach, so it must come from the server (the request Host, or the
 * MCP request context), never from a caller who could name any realm.
 */
export async function searchSubjectsInRealm(
    request: SearchRequest,
    realmSource: RealmSource,
    options?: { skipQueryLog?: boolean }
): Promise<SubjectSearchHits> {
    try {
        const realm = typeof realmSource === 'function' ? await realmSource() : realmSource;
        // Persist the query for usage analytics. Skipped for paginated requests
        // (same query, next page), filter-only searches and internal callers.
        const queryText = request.query?.trim() ?? '';
        if (!options?.skipQueryLog && queryText && (request.config?.from ?? 0) === 0) {
            void logSearchQuery(queryText);
        }

        // Tenant isolation: a search never leaves the realm it arrived on. An
        // absent city filter defaults to the realm's municipalities, and an
        // explicit one keeps only the ids inside the realm — so a city from
        // another realm narrows the search to nothing rather than reaching
        // across the boundary. The cap is applied here rather than on the
        // index's `city_realm` field so it holds for documents indexed before
        // that field existed.
        const hasExplicitCityFilter = Boolean(request.cityIds?.length);
        const cityIds = request.cityIds?.length
            ? await filterCityIdsByRealm(request.cityIds, realm)
            : (await getCities({}, realm)).map(city => city.id);

        // Every candidate city was filtered out (or the realm has none), so
        // nothing can match. Returning early matters: an empty list means "no
        // city filter" to buildFilters, which would search every realm.
        if (cityIds.length === 0) {
            logEssential('Search Session Skipped — no city in realm', { query: request.query, realm });
            return { hits: [], total: 0, dropped: 0, derivedFilters: {} };
        }

        // Log search session start with query and filters
        logEssential('Search Session Started', {
            query: request.query,
            realm,
            filters: {
                cityIds,
                personIds: request.personIds,
                partyIds: request.partyIds,
                topicIds: request.topicIds,
                dateRange: request.dateRange,
                hasLocations: request.locations ? request.locations.length > 0 : false
            }
        });

        // Reading filters out of the query text is for callers whose whole
        // query is one free-text box. It costs a model call, plus a geocode per
        // candidate city when the query names a place, so a caller that already
        // holds its filters can decline both.
        const derivingFilters = request.config?.extractFilters ?? true;

        // Extract filters from the query using AI (non-fatal — search works without it)
        let extractedFilters: ExtractedFilters = NO_EXTRACTED_FILTERS;
        if (queryText && derivingFilters) {
            try {
                extractedFilters = await extractFilters(queryText, realm);
                logEssential('[Search] Extracted filters:', extractedFilters);
            } catch (error) {
                console.error('[Search] AI filter extraction failed, continuing without AI filters:', error);
            }
        }

        // Process filters and resolve locations (non-fatal)
        let processedFilters: Awaited<ReturnType<typeof processFilters>> = {
            cityIds: undefined,
            dateRange: undefined,
            locations: undefined,
        };
        if (derivingFilters) {
            try {
                processedFilters = await processFilters(extractedFilters, realm, cityIds);
            } catch (error) {
                console.error('[Search] Filter processing failed, continuing without processed filters:', error);
            }
        }

        // The AI's reading of the query text is advisory: it only fills in a
        // filter the caller left unset, and never replaces one they set. The
        // caller's filters are the ones the UI shows, so letting the extraction
        // win would search a municipality or period that contradicts the pills
        // on screen. An extracted city id outside the realm is dropped too —
        // the model reads a realm-scoped list but can still name anything.
        const extractedCityIds = !hasExplicitCityFilter && processedFilters.cityIds?.length
            ? await filterCityIdsByRealm(processedFilters.cityIds, realm)
            : [];

        // Merge with explicit filters
        const mergedRequest: SearchRequest = {
            ...request,
            cityIds: extractedCityIds.length > 0 ? extractedCityIds : cityIds,
            dateRange: request.dateRange ?? processedFilters.dateRange,
            locations: request.locations ?? processedFilters.locations
        };

        // Report back the filters the query text supplied, so a caller showing
        // filters on screen can show these too rather than narrowing silently.
        // Mirrors the merge above: a field is derived exactly when the merge
        // took the extraction's value instead of the caller's.
        const derivedFilters: DerivedFilters = {
            ...(extractedCityIds.length > 0 && { cityIds: extractedCityIds }),
            ...(!request.dateRange && processedFilters.dateRange && { dateRange: processedFilters.dateRange }),
            ...(!request.locations && processedFilters.locations && { locations: processedFilters.locations }),
        };

        // Build and execute the search query with retry logic
        const searchQuery = buildSearchQuery(mergedRequest, extractedFilters);
        
        logEssential('Executing search query', { 
            hasSemanticSearch: request.config?.enableSemanticSearch 
        });

        const response = await executeElasticsearchWithRetry(
            () => client.search<SubjectDocument>(searchQuery),
            'Search'
        );

        // Get total hits
        const total = response.hits.total as { value: number; relation: string };
        const totalHits = total.value;

        // Log search session completion with results summary
        logEssential('Search Session Completed', {
            query: request.query,
            results: {
                totalHits,
                resultCount: response.hits.hits.length,
                took: `${response.took}ms`,
                topScore: response.hits.hits[0]?._score || 0
            }
        });

        // The index can be stale: a meeting unreleased after indexing must not
        // surface. The database is the source of truth, so re-check before
        // anything downstream trusts these ids. Only the release flag is read,
        // so the check costs one narrow query instead of riding along with the
        // full hydration it used to sit inside.
        const hitIds = response.hits.hits
            .map(hit => hit._source?.id)
            .filter((id): id is string => id !== undefined);

        const visible = await prisma.subject.findMany({
            where: { id: { in: hitIds } },
            select: { id: true, councilMeeting: { select: { released: true } } },
        });
        const visibleById = new Map(visible.map(subject => [subject.id, subject]));

        const { resolved, orphanedIds, unreleasedIds, droppedWithoutSource } = partitionHits(
            response.hits.hits,
            visibleById,
            subject => subject.councilMeeting.released,
        );

        if (orphanedIds.length > 0 || unreleasedIds.length > 0 || droppedWithoutSource > 0) {
            logEssential('[Search] Dropped unresolvable hits', { orphanedIds, unreleasedIds, droppedWithoutSource });
            void reportOrphanedHits({
                orphanedIds,
                unreleasedIds,
                droppedWithoutSource,
                // Filter-only searches have no query text; label them so the
                // alert reads sensibly instead of showing an empty string.
                query: queryText || '(filter-only)',
                index: env.ELASTICSEARCH_INDEX,
            });
        }

        // ES's total includes hits we dropped; subtract this page's drops so the
        // count degrades along with the results. Still approximate — other pages
        // may hold more drops, so callers that must not leak the existence of
        // hidden content should withhold the total whenever `dropped` > 0.
        const dropped = response.hits.hits.length - resolved.length;
        return {
            hits: resolved.map(({ hit, subject }) => ({
                id: subject.id,
                score: hit._score || 0,
                nameHighlight: hit.highlight?.name?.[0],
                descriptionHighlight: hit.highlight?.description?.[0],
            })),
            total: totalHits - dropped,
            dropped,
            derivedFilters,
        };
    } catch (error) {
        failSearch(request, error);
    }
}

/**
 * Search, hydrated into full subject rows.
 *
 * The client-facing entry point is `search()` in ./index.ts, which passes the
 * request-scoped realm resolver; server-side callers that hold their own realm
 * context (the MCP tool handlers, which run outside a request scope) pass the
 * realm itself. A caller that wants a lighter shape than `SearchResultLight`
 * should use `searchSubjectsInRealm` and hydrate the ids its own way.
 */
export async function searchInRealm(
    request: SearchRequest,
    realmSource: RealmSource,
    options?: { skipQueryLog?: boolean }
): Promise<SearchResponse> {
    const { hits, total, dropped, derivedFilters } = await searchSubjectsInRealm(request, realmSource, options);
    if (hits.length === 0) return { results: [], total, dropped, derivedFilters };

    try {
        const subjectIds = hits.map(hit => hit.id);

        // Fetch all subjects in a single query
        const subjects = await prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            include: {
                location: true,
                topic: true,
                councilMeeting: {
                    include: {
                        city: true,
                        administrativeBody: true
                    }
                },
                introducedBy: {
                    include: {
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true
                            }
                        }
                    }
                },
                contributions: {
                    include: {
                        speaker: {
                            include: {
                                roles: {
                                    include: {
                                        party: true,
                                        city: true,
                                        administrativeBody: true
                                    }
                                }
                            }
                        }
                    }
                },
                highlights: true,
                decision: true,
                discussedIn: {
                    include: {
                        topic: true
                    }
                }
            }
        });

        // Create a map of subjects by ID for efficient lookup
        const subjectMap = new Map(subjects.map(subject => [subject.id, subject]));

        // For detailed results, fetch the speaker segments discussing each subject
        // (segments whose utterances are tagged with the subject via discussionSubjectId)
        const segmentsBySubject = new Map<string, SubjectDiscussionSegment[]>();
        if (request.config?.detailed && subjectIds.length > 0) {
            const subjectIdSet = new Set(subjectIds);
            const segments = await prisma.speakerSegment.findMany({
                where: {
                    utterances: { some: { discussionSubjectId: { in: subjectIds } } }
                },
                include: subjectDiscussionSegmentInclude,
                orderBy: { startTimestamp: 'asc' }
            });
            for (const segment of segments) {
                const discussedSubjectIds = new Set(
                    segment.utterances
                        .map(u => u.discussionSubjectId)
                        .filter((id): id is string => id !== null && subjectIdSet.has(id))
                );
                for (const discussedSubjectId of discussedSubjectIds) {
                    const list = segmentsBySubject.get(discussedSubjectId);
                    if (list) {
                        list.push(segment);
                    } else {
                        segmentsBySubject.set(discussedSubjectId, [segment]);
                    }
                }
            }
        }

        // Get all location IDs for coordinates query
        const locationIds = subjects
            .map(subject => subject.location?.id)
            .filter((id): id is string => id !== undefined);

        // Fetch all location coordinates in a single query
        const locationCoordinates = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ANY(${locationIds})
            AND type = 'point'
        `;

        // Create a map of location coordinates by ID
        const locationCoordinatesMap = new Map(
            locationCoordinates.map(loc => [loc.id, { x: loc.x, y: loc.y }])
        );

        const results = hits.flatMap(({ id, score, nameHighlight, descriptionHighlight }) => {
            const subject = subjectMap.get(id);
            // Retrieval already re-checked every id against the database, so a
            // miss here means the row went away between the two queries. Drop
            // it rather than fail the search over a race.
            if (!subject) return [];

            // Get location coordinates if available
            let locationWithCoordinates = null;
            if (subject.location) {
                const coordinates = locationCoordinatesMap.get(subject.location.id);
                if (coordinates) {
                    locationWithCoordinates = {
                        ...subject.location,
                        coordinates
                    };
                }
            }

            // Base result with common fields
            const baseResult: SearchResultLight = {
                ...subject,
                location: locationWithCoordinates,
                score,
                nameHighlight,
                descriptionHighlight,
                councilMeeting: subject.councilMeeting,
                votes: [],
                attendance: []
            };

            // If detailed results are requested, add speaker segment text
            if (request.config?.detailed) {
                const speakerSegments = (segmentsBySubject.get(subject.id) ?? [])
                    .filter(segment => {
                        const text = segment.utterances.map(u => u.text).join(' ');
                        const hasPerson = segment.speakerTag?.person != null;
                        const hasRoles = Array.isArray(segment.speakerTag?.person?.roles);
                        return text.length >= 100 && hasPerson && hasRoles;
                    })
                    .map(segment => ({
                        id: segment.id,
                        startTimestamp: segment.startTimestamp,
                        endTimestamp: segment.endTimestamp,
                        meeting: segment.meeting,
                        person: segment.speakerTag?.person || null,
                        text: segment.utterances.map(u => u.text).join(' '),
                        summary: segment.summary ? { text: segment.summary.text } : null
                    }));

                return [{
                    ...baseResult,
                    speakerSegments,
                    context: subject.context
                } as SearchResultDetailed];
            }

            return [baseResult];
        });

        return { results, total, dropped, derivedFilters };
    } catch (error) {
        failSearch(request, error);
    }
}
