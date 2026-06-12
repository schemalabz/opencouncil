import { MAP_DEFAULT_MONTHS_BACK, MAP_MONTHS_MAX, MAP_MONTHS_MIN } from './constants';

/**
 * Filter state shared between the /map page URL (?topics=&months=), the
 * server shell, and the /api/map/subjects query.
 */
export interface MapFilterState {
    /** null = all topics */
    topicIds: string[] | null;
    monthsBack: number;
}

export const DEFAULT_MAP_FILTER: MapFilterState = {
    topicIds: null,
    monthsBack: MAP_DEFAULT_MONTHS_BACK,
};

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Parses ?topics=a,b&months=6 page params into a MapFilterState; garbage falls back to defaults. */
export function parseMapFilterParams(params: { topics?: SearchParamValue; months?: SearchParamValue }): MapFilterState {
    const topicsRaw = firstValue(params.topics);
    const monthsRaw = firstValue(params.months);

    const topicIds = topicsRaw
        ? Array.from(new Set(topicsRaw.split(',').map(id => id.trim()).filter(Boolean)))
        : [];

    let monthsBack = MAP_DEFAULT_MONTHS_BACK;
    if (monthsRaw) {
        const parsed = parseInt(monthsRaw, 10);
        if (Number.isFinite(parsed)) {
            monthsBack = Math.min(MAP_MONTHS_MAX, Math.max(MAP_MONTHS_MIN, parsed));
        }
    }

    return { topicIds: topicIds.length > 0 ? topicIds : null, monthsBack };
}

export function isDefaultFilter(filter: MapFilterState): boolean {
    return filter.topicIds === null && filter.monthsBack === MAP_DEFAULT_MONTHS_BACK;
}

/** Page-URL params (?topics=&months=) — only non-default values are written. */
export function mapFilterToSearchParams(filter: MapFilterState): URLSearchParams {
    const params = new URLSearchParams();
    if (filter.topicIds && filter.topicIds.length > 0) {
        params.set('topics', filter.topicIds.join(','));
    }
    if (filter.monthsBack !== MAP_DEFAULT_MONTHS_BACK) {
        params.set('months', String(filter.monthsBack));
    }
    return params;
}

/** Query params for GET /api/map/subjects (monthsBack, topicIds). */
export function mapFilterToApiQuery(filter: MapFilterState): URLSearchParams {
    const params = new URLSearchParams();
    params.set('monthsBack', String(filter.monthsBack));
    if (filter.topicIds && filter.topicIds.length > 0) {
        params.set('topicIds', filter.topicIds.join(','));
    }
    return params;
}
