import type { CityStatus, Prisma } from '@prisma/client';

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
 */

/**
 * Published: appears on the landing map, in the δήμοι directory, in search, in
 * MCP and in the sitemap. Both `demo` and `supported` cities are.
 */
export function isPublic(status: CityStatus): boolean {
    return status === 'demo' || status === 'supported';
}

/**
 * A customer municipality. Gates the official-support badge, the customer-facing
 * counts on the marketing pages, and the internal ops lists (reviews, uploads).
 */
export function isCustomer(status: CityStatus): boolean {
    return status === 'supported';
}

/**
 * Not published: the city exists in our data but we do not cover it. These are
 * the municipalities the landing map offers up for petitioning.
 */
export function isOutOfNetwork(status: CityStatus): boolean {
    return status === 'pending';
}

/**
 * Can be petitioned for official support. A `demo` city can: showing what
 * OpenCouncil looks like there is exactly what makes asking for it worthwhile.
 * Only a city that already has support cannot.
 */
export function isPetitionable(status: CityStatus): boolean {
    return status !== 'supported';
}

/** Spread into a City where-clause, or into a nested `city: { … }` filter. */
export const PUBLIC_CITY_WHERE = {
    status: { in: ['demo', 'supported'] },
} satisfies Prisma.CityWhereInput;

export const CUSTOMER_CITY_WHERE = {
    status: 'supported',
} satisfies Prisma.CityWhereInput;

export const OUT_OF_NETWORK_CITY_WHERE = {
    status: 'pending',
} satisfies Prisma.CityWhereInput;
