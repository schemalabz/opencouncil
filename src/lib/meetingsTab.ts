import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { getAdministrativeBodyTypes, getBodiesOfType } from '@/lib/utils/administrativeBodies';
import type { FilterOption } from '@/lib/utils/filterURL';

/**
 * The meetings tab's filter, built the same way by the server page (which
 * parses the URL with it) and by CityMeetings (which draws it). Built twice
 * from the same bodies, the two cannot disagree about which view a URL names.
 */
export function meetingsTabFilters(bodies: PublicAdministrativeBody[], t: (key: string) => string) {
    const filterOptions: FilterOption<AdministrativeBodyType>[] = getAdministrativeBodyTypes(bodies, t);
    const defaultFilterValues: AdministrativeBodyType[] | undefined = filterOptions.some(o => o.value === 'council')
        ? ['council']
        : undefined;
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

/** The page to show: the requested one, or the last page when the request is past the end. */
export function clampPage(requested: number, total: number, pageSize: number): number {
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    return Math.min(Math.max(1, requested), lastPage);
}
