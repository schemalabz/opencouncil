import type { Topic } from '@prisma/client';
import { detectMunicipalityQuery, detectCategoryQuery, looksLikeAddress, type LandingListCity, type MunicipalityInterest } from '@/lib/landing/landingData';
import { hasActiveFilters, type MapFilters } from '@/lib/landing/landingCore';

// The "known city" arm of MunicipalityInterest — derived, not re-declared, so it can't drift.
type KnownMunicipality = Extract<MunicipalityInterest, { kind: 'known' }>;

type Args = {
    query: string;
    cities: LandingListCity[];
    topics: Topic[];
    /** selected category ids (empty = all) */
    cats: string[];
    filters: MapFilters;
};

export type SearchMatches = {
    /** the query is similar to a category not yet active → offer to apply it as a filter */
    matchedTopic: Topic | null;
    /** the query matches an OC municipality not yet active → offer to filter by it */
    knownMunicipality: KnownMunicipality | null;
    /** the text is shaped like a place, so flying there leads the options rather than trailing them */
    addressFirst: boolean;
    /** a date-range filter is set */
    dateActive: boolean;
    /** any category/filter is active (drives the "clear all" affordance) */
    anyFilterActive: boolean;
};

/**
 * Interprets the search query against topics, cities and filters, surfacing the actionable
 * options the search body offers (apply category, filter by δήμος, search the subjects, fly to
 * an address) plus the filter-active flags. Pure derivations, shared by the desktop dropdown and
 * mobile overlay.
 */
export function useSearchMatches({ query, cities, topics, cats, filters }: Args): SearchMatches {
    const municipality = detectMunicipalityQuery(query, cities);

    const matchedCatId = detectCategoryQuery(query, topics);
    const matchedTopic =
        matchedCatId && !cats.includes(matchedCatId) ? topics.find((t) => t.id === matchedCatId) ?? null : null;
    const knownMunicipality = municipality?.kind === 'known' && !filters.cityIds.includes(municipality.cityId) ? municipality : null;

    return {
        matchedTopic,
        knownMunicipality,
        // Decided by the shape of the text, the same way the Enter key decides.
        // The two used to disagree: Enter read the shape, while the row read how
        // many loaded subjects the text happened to match — so the dropdown could
        // offer to geocode something Enter would have searched for.
        addressFirst: looksLikeAddress(query) && !matchedTopic && !knownMunicipality,
        dateActive: !!(filters.dateFrom || filters.dateTo),
        anyFilterActive: cats.length > 0 || hasActiveFilters(filters),
    };
}
