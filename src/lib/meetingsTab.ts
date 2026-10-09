import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { getAdministrativeBodyTypes, getBodiesOfType } from '@/lib/utils/administrativeBodies';
import { isSecondaryBody, TIER_PARAM } from '@/lib/utils/bodyTier';
import { withBodySelection, type FilterOption } from '@/lib/utils/filterURL';

/**
 * The meetings tab's filter, built the same way by the server page (which
 * parses the URL with it) and by CityMeetings (which draws it). Built twice
 * from the same bodies, the two cannot disagree about which view a URL names.
 */
export function meetingsTabFilters(
    bodies: PublicAdministrativeBody[],
    t: (key: string) => string,
    { widened = false }: {
        /**
         * The tab widened to the secondary tier by itself (#829), for a body
         * admin or a city with no primary meeting. The default is then every
         * meeting: the rows it loaded for them would otherwise hide behind the
         * council chip, and the picker names one type or all, so a default of
         * two types would read as «all» and still hide the rest.
         */
        widened?: boolean;
    } = {},
) {
    const filterOptions: FilterOption<AdministrativeBodyType>[] = getAdministrativeBodyTypes(bodies, t);
    const defaultFilterValues: AdministrativeBodyType[] | undefined = widened
        ? []
        : filterOptions.some(o => o.value === 'council') ? ['council'] : undefined;
    // Council stays a single body in practice, so it offers no body picker
    // (legacy behavior).
    const bodyOptionsFor = (type: AdministrativeBodyType): FilterOption<string>[] =>
        type === 'council' ? [] : getBodiesOfType(bodies, type);
    return { filterOptions, defaultFilterValues, bodyOptionsFor };
}

/**
 * The body filter for the meetings query, or null when the selection can
 * match no meeting.
 *
 * Types become the ids of all of the city's bodies of those types, not a type
 * filter: the query's type filter counts a meeting with no body as the
 * council's (the overview reads it so), and this tab shows such a meeting only
 * under "all". `bodies` must hold every body of the city, so that "the type is
 * T" and "the id is one of the bodies of type T" select the same meetings.
 *
 * The query reads an empty id list as no filter at all, so a type that finds
 * no body here — two body caches out of step — must not reach it as one: it
 * would list every meeting under that type's name.
 */
export function meetingBodyFilter(
    view: { selectedFilters: AdministrativeBodyType[]; selectedBody: string | null },
    bodies: Pick<AdministrativeBody, 'id' | 'type'>[],
): { administrativeBodyIds?: string[] } | null {
    if (view.selectedBody) return { administrativeBodyIds: [view.selectedBody] };
    if (view.selectedFilters.length === 0) return {};
    const ids = [...new Set(bodies.filter(body => view.selectedFilters.includes(body.type)).map(body => body.id))];
    return ids.length > 0 ? { administrativeBodyIds: ids } : null;
}

/**
 * The meetings tab narrowed to one body: where the page of a body sends a
 * reader for the meetings beyond the ones it loaded (#829). The tab stores a
 * selection by label, so the href carries the type's label in the reader's
 * locale and the body's name, through the same options the tab offers: the
 * council gets its type alone. A secondary body also widens the tab's tier.
 */
export function meetingsTabHrefForBody(cityId: string, body: PublicAdministrativeBody, t: (key: string) => string): string {
    const { filterOptions, bodyOptionsFor } = meetingsTabFilters([body], t);
    const params = withBodySelection(new URLSearchParams({ filters: filterOptions[0].label }), body.id, bodyOptionsFor(body.type));
    if (isSecondaryBody(body)) params.set(TIER_PARAM, 'all');
    return `/${cityId}/meetings?${params.toString()}`;
}
