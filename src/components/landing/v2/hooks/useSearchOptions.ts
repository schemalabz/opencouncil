import { useMemo } from 'react';
import type { Topic } from '@prisma/client';
import type { LandingListCity, MunicipalityInterest } from '@/lib/landing/landingData';
import type { MapFilters } from '@/lib/landing/landingCore';
import { useSearchMatches, type SearchMatches } from './useSearchMatches';

type KnownMunicipality = Extract<MunicipalityInterest, { kind: 'known' }>;

/**
 * One thing the reader can do with what they typed.
 *
 * Data rather than markup, because the list is navigated from the input — which
 * lives in a different component from the rows — and an index into an array is
 * the only way the two can agree on which option is highlighted.
 */
export type SearchOption =
    | { kind: 'category'; topic: Topic }
    | { kind: 'municipality'; municipality: KnownMunicipality }
    | { kind: 'subjects' }
    | { kind: 'address' };

/** Stable id for `aria-activedescendant`, and for React keys. */
export function searchOptionId(option: SearchOption, index: number): string {
    return `landing-search-option-${index}-${option.kind}`;
}

export type SearchOptions = SearchMatches & { options: SearchOption[] };

/**
 * The options for a set of matches, in the order they are shown.
 *
 * Searching the subjects is always among them: it is the only option that can
 * answer a question about what a council said, and nothing local can rule out
 * that there is an answer. Flying to an address is always there too, because no
 * rule recognises every place name — it just sits last, out of the way, unless
 * the text is shaped like an address, in which case it leads and takes the
 * default highlight.
 */
export function buildSearchOptions({ matchedTopic, knownMunicipality, addressFirst }: SearchMatches): SearchOption[] {
    const rest: SearchOption[] = [];
    if (matchedTopic) rest.push({ kind: 'category', topic: matchedTopic });
    if (knownMunicipality) rest.push({ kind: 'municipality', municipality: knownMunicipality });
    rest.push({ kind: 'subjects' });
    const address: SearchOption = { kind: 'address' };
    return addressFirst ? [address, ...rest] : [...rest, address];
}

/** The actions on offer for the current text — see buildSearchOptions for the order. */
export function useSearchOptions(args: {
    query: string;
    cities: LandingListCity[];
    topics: Topic[];
    cats: string[];
    filters: MapFilters;
}): SearchOptions {
    const matches = useSearchMatches(args);
    const { matchedTopic, knownMunicipality, addressFirst } = matches;

    // Rebuilt only when what is on offer changes, so the keyboard cursor is not
    // pointed at a fresh array on every render.
    const options = useMemo(
        () => buildSearchOptions({ ...matches, matchedTopic, knownMunicipality, addressFirst }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [matchedTopic, knownMunicipality, addressFirst],
    );

    return { ...matches, options };
}
