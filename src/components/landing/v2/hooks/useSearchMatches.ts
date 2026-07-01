import type { Topic } from '@prisma/client';
import { detectMunicipalityQuery, detectCategoryQuery, type LandingCity, type QueryKind } from '../landingData';
import { hasActiveFilters, type MapFilters } from '../landingCore';

type KnownMunicipality = { kind: 'known'; cityId: string; name: string; nameMunicipality: string };

type Args = {
    query: string;
    queryKind: QueryKind;
    cities: LandingCity[];
    topics: Topic[];
    /** selected category ids (empty = all) */
    cats: string[];
    filters: MapFilters;
};

export type SearchMatches = {
    /** a "δήμος X" search for a municipality outside our network → offer the petition */
    unknownMunicipality: string | null;
    /** the query is similar to a category not yet active → offer to apply it as a filter */
    matchedTopic: Topic | null;
    /** the query matches an OC municipality not yet active → offer to filter by it */
    knownMunicipality: KnownMunicipality | null;
    /** address-style query with no category/municipality match → offer to fly there */
    showAddressOption: boolean;
    /** a date-range filter is set */
    dateActive: boolean;
    /** any category/filter is active (drives the "clear all" affordance) */
    anyFilterActive: boolean;
};

/**
 * Interprets the current search query against the available topics, cities and filters,
 * surfacing the actionable options the search body offers (apply category, filter by δήμος,
 * petition an out-of-network δήμος, fly to an address) plus the filter-active flags. Pure
 * derivations — no state — so the desktop dropdown and mobile overlay share one source.
 */
export function useSearchMatches({ query, queryKind, cities, topics, cats, filters }: Args): SearchMatches {
    const municipality = detectMunicipalityQuery(query, cities);
    const unknownMunicipality = municipality?.kind === 'unknown' ? municipality.name : null;

    const matchedCatId = detectCategoryQuery(query, topics);
    const matchedTopic =
        matchedCatId && !cats.includes(matchedCatId) ? topics.find((t) => t.id === matchedCatId) ?? null : null;
    const knownMunicipality = municipality?.kind === 'known' && !filters.cityIds.includes(municipality.cityId) ? municipality : null;
    const showAddressOption = queryKind === 'address' && !matchedTopic && !knownMunicipality && !unknownMunicipality;

    return {
        unknownMunicipality,
        matchedTopic,
        knownMunicipality,
        showAddressOption,
        dateActive: !!(filters.dateFrom || filters.dateTo),
        anyFilterActive: cats.length > 0 || hasActiveFilters(filters),
    };
}
