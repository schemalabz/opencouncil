import type { AdministrativeBodyType } from '@prisma/client';
import { MAP_DEFAULT_MONTHS_BACK, MAP_MONTHS_MAX, MAP_MONTHS_MIN } from './constants';

/**
 * Filter state shared between the /map page URL
 * (?topics=&months=&cities=&bodies=&from=&to=), the server shell, and the
 * /api/map/subjects query.
 */
export interface MapFilterState {
    /** null = all topics */
    topicIds: string[] | null;
    monthsBack: number;
    /** null = all supported municipalities */
    cityIds: string[] | null;
    /** null = all administrative bodies */
    bodyTypes: AdministrativeBodyType[] | null;
    /** ISO dates (yyyy-mm-dd); when either is set they override monthsBack */
    dateFrom: string | null;
    dateTo: string | null;
}

export const DEFAULT_MAP_FILTER: MapFilterState = {
    topicIds: null,
    monthsBack: MAP_DEFAULT_MONTHS_BACK,
    cityIds: null,
    bodyTypes: null,
    dateFrom: null,
    dateTo: null,
};

const BODY_TYPES: AdministrativeBodyType[] = ['council', 'committee', 'community'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function parseIdList(raw: string | undefined): string[] | null {
    if (!raw) return null;
    const ids = Array.from(new Set(raw.split(',').map(id => id.trim()).filter(Boolean)));
    return ids.length > 0 ? ids : null;
}

function parseDate(raw: string | undefined): string | null {
    return raw && ISO_DATE.test(raw) ? raw : null;
}

export interface MapFilterSearchParams {
    topics?: SearchParamValue;
    months?: SearchParamValue;
    cities?: SearchParamValue;
    bodies?: SearchParamValue;
    from?: SearchParamValue;
    to?: SearchParamValue;
}

/** Parses page params into a MapFilterState; garbage falls back to defaults. */
export function parseMapFilterParams(params: MapFilterSearchParams): MapFilterState {
    const monthsRaw = firstValue(params.months);
    let monthsBack = MAP_DEFAULT_MONTHS_BACK;
    if (monthsRaw) {
        const parsed = parseInt(monthsRaw, 10);
        if (Number.isFinite(parsed)) {
            monthsBack = Math.min(MAP_MONTHS_MAX, Math.max(MAP_MONTHS_MIN, parsed));
        }
    }

    const bodyTypes = parseIdList(firstValue(params.bodies))
        ?.filter((value): value is AdministrativeBodyType => (BODY_TYPES as string[]).includes(value)) ?? null;

    return {
        topicIds: parseIdList(firstValue(params.topics)),
        monthsBack,
        cityIds: parseIdList(firstValue(params.cities)),
        bodyTypes: bodyTypes && bodyTypes.length > 0 ? bodyTypes : null,
        dateFrom: parseDate(firstValue(params.from)),
        dateTo: parseDate(firstValue(params.to)),
    };
}

export function isDefaultFilter(filter: MapFilterState): boolean {
    return filter.topicIds === null &&
        filter.monthsBack === MAP_DEFAULT_MONTHS_BACK &&
        filter.cityIds === null &&
        filter.bodyTypes === null &&
        filter.dateFrom === null &&
        filter.dateTo === null;
}

/** True when any filter besides the time presets narrows the data. */
export function hasNarrowingFilters(filter: MapFilterState): boolean {
    return filter.topicIds !== null || filter.cityIds !== null ||
        filter.bodyTypes !== null || filter.dateFrom !== null || filter.dateTo !== null;
}

/** Page-URL params — only non-default values are written. */
export function mapFilterToSearchParams(filter: MapFilterState): URLSearchParams {
    const params = new URLSearchParams();
    if (filter.topicIds && filter.topicIds.length > 0) params.set('topics', filter.topicIds.join(','));
    if (filter.monthsBack !== MAP_DEFAULT_MONTHS_BACK) params.set('months', String(filter.monthsBack));
    if (filter.cityIds && filter.cityIds.length > 0) params.set('cities', filter.cityIds.join(','));
    if (filter.bodyTypes && filter.bodyTypes.length > 0) params.set('bodies', filter.bodyTypes.join(','));
    if (filter.dateFrom) params.set('from', filter.dateFrom);
    if (filter.dateTo) params.set('to', filter.dateTo);
    return params;
}

/** Query params for GET /api/map/subjects. */
export function mapFilterToApiQuery(filter: MapFilterState): URLSearchParams {
    const params = new URLSearchParams();
    params.set('monthsBack', String(filter.monthsBack));
    if (filter.topicIds && filter.topicIds.length > 0) params.set('topicIds', filter.topicIds.join(','));
    if (filter.cityIds && filter.cityIds.length > 0) params.set('cityIds', filter.cityIds.join(','));
    if (filter.bodyTypes && filter.bodyTypes.length > 0) params.set('bodyTypes', filter.bodyTypes.join(','));
    if (filter.dateFrom) params.set('from', filter.dateFrom);
    if (filter.dateTo) params.set('to', filter.dateTo);
    return params;
}
