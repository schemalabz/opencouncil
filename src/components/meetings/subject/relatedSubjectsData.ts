import 'server-only';
import { cache } from 'react';
import { getRealm } from '@/lib/realm.server';
import { searchRelatedSubjectsInRealm } from '@/lib/search/core';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import type { RelatedScope, SearchResultLight } from '@/lib/search/types';

/** A subject's neighbours at both levels. A level that failed to load is empty. */
export interface RelatedNeighbours {
    city: SearchResultLight[];
    other: SearchResultLight[];
}

// React's cache compares arguments by identity, and each call site builds its
// own seed object, so the memo is keyed on the seed's fields instead.
const loadByFields = cache(async (
    id: string,
    name: string,
    cityId: string,
    councilMeetingId: string,
): Promise<RelatedNeighbours> => {
    const seed: RelatedSubjectSeed = { id, name, cityId, councilMeetingId };
    const load = (scope: RelatedScope): Promise<SearchResultLight[]> =>
        searchRelatedSubjectsInRealm(seed, scope, getRealm).catch(() => []);
    const [city, other] = await Promise.all([load('city'), load('other')]);
    return { city, other };
});

/**
 * The subject's neighbours, once per request. The related section and the
 * header strip both read them from different slots of the page, and React's
 * cache hands the second reader the first reader's promise, so the two index
 * lookups and the hydration behind them run once. A level that fails to load
 * counts as empty: the search core has already logged and alerted, and a
 * recommendation must not take the page down with it.
 */
export function loadRelatedNeighbours(seed: RelatedSubjectSeed): Promise<RelatedNeighbours> {
    return loadByFields(seed.id, seed.name, seed.cityId, seed.councilMeetingId);
}
