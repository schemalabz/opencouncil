import type { CityStatus, Prisma } from '@prisma/client';
import { secondaryMeetingWhere } from '@/lib/utils/bodyTier';

/**
 * Predicates over `City.status`, so the meaning of each state lives in one place
 * instead of being re-derived as a raw comparison at ~40 call sites — which is
 * how the field this replaced (`officialSupport`) came to mean two different
 * things depending on who was reading it.
 *
 * Type-only Prisma import, so this is safe in client components too.
 *
 * The raw-SQL twins live in `db/cities.ts` (`publicCityStatusSql`,
 * `outOfNetworkCityStatusSql`) — the compiler cannot see enum values inside a
 * template literal, so those must be changed in step with these.
 *
 * Since #829 a city is public by status, or through a secondary body that has
 * released a meeting. The status predicates below answer for the status alone;
 * the where clauses and the `*City` predicates answer for both routes.
 */

/**
 * Published by status: appears on the landing map, in the δήμοι directory, in
 * search, in MCP and in the sitemap. Both `demo` and `supported` cities are.
 * A row-level answer that adds the second route is {@link isPublicCity}.
 */
export function isPublic(status: CityStatus): boolean {
    return status === 'demo' || status === 'supported';
}

/**
 * The second route to publicness (#829): a secondary body of the city has
 * released a meeting. `City.status` keeps its meaning. A municipality that has
 * given us nothing but its youth council stays `pending`: petitionable, with
 * no official-support badge and out of the customer counts, and its page shows
 * that council. The raw-SQL twin is `publicThroughSecondarySql` in db/cities.ts.
 */
export const PUBLIC_THROUGH_SECONDARY_WHERE = {
    councilMeetings: { some: { released: true, ...secondaryMeetingWhere } },
} satisfies Prisma.CityWhereInput;

/** A city row with the second route resolved, for the row-level predicates. */
export interface CityPublicness {
    status: CityStatus;
    publicThroughSecondary: boolean;
}

export function isPublicCity(city: CityPublicness): boolean {
    return isPublic(city.status) || city.publicThroughSecondary;
}

/** Public through a secondary body alone: the directory and the city page tag it. */
export function isPublicThroughSecondaryOnly(city: CityPublicness): boolean {
    return !isPublic(city.status) && city.publicThroughSecondary;
}

/**
 * A customer municipality. Gates the official-support badge, the customer-facing
 * counts on the marketing pages, and the internal ops lists (reviews, uploads).
 */
export function isCustomer(status: CityStatus): boolean {
    return status === 'supported';
}

/**
 * Not published by status: the city exists in our data but we do not cover it.
 * These are the municipalities the landing map offers up for petitioning. A
 * row-level answer that excludes the cities public through a secondary body is
 * {@link isOutOfNetworkCity}: the map must not draw one δήμος on both layers.
 */
export function isOutOfNetwork(status: CityStatus): boolean {
    return status === 'pending';
}

export function isOutOfNetworkCity(city: CityPublicness): boolean {
    return isOutOfNetwork(city.status) && !city.publicThroughSecondary;
}

/**
 * Can be petitioned for official support. A `demo` city can: showing what
 * OpenCouncil looks like there is exactly what makes asking for it worthwhile.
 * Only a city that already has support cannot.
 */
export function isPetitionable(status: CityStatus): boolean {
    return status !== 'supported';
}

export const PUBLIC_STATUSES = ['demo', 'supported'] as const satisfies readonly CityStatus[];

/**
 * Spread into a City where-clause, or into a nested `city: { … }` filter. Both
 * routes to publicness, so it is an OR: a caller that spreads it beside its own
 * `OR` must nest it under `AND` instead.
 */
export const PUBLIC_CITY_WHERE = {
    OR: [{ status: { in: [...PUBLIC_STATUSES] } }, PUBLIC_THROUGH_SECONDARY_WHERE],
} satisfies Prisma.CityWhereInput;

export const CUSTOMER_CITY_WHERE = {
    status: 'supported',
} satisfies Prisma.CityWhereInput;

export const OUT_OF_NETWORK_CITY_WHERE = {
    status: 'pending',
    NOT: PUBLIC_THROUGH_SECONDARY_WHERE,
} satisfies Prisma.CityWhereInput;
