import type { Prisma } from '@prisma/client';

/**
 * Which unreleased meetings of a city a viewer may see: every one, for a
 * superadmin or a city admin; the meetings of the bodies they administer, for
 * a body admin (#828); none, for a reader. `src/lib/auth.ts` resolves it from
 * the session; this module turns it into a filter and a cache key, with no
 * session of its own, so cached queries can take it from their caller.
 */
export type UnreleasedScope = { all: true } | { all: false; bodyIds: string[] };

export const NO_UNRELEASED: UnreleasedScope = { all: false, bodyIds: [] };

export const ALL_UNRELEASED: UnreleasedScope = { all: true };

/** The `CouncilMeeting` filter that hides what the scope does not reach. */
export function unreleasedMeetingWhere(scope: UnreleasedScope = NO_UNRELEASED): Prisma.CouncilMeetingWhereInput {
    if (scope.all) return {};
    if (scope.bodyIds.length === 0) return { released: true };
    return { OR: [{ released: true }, { administrativeBodyId: { in: scope.bodyIds } }] };
}

/** A cache-key fragment: two viewers with different scopes never share an entry. */
export function unreleasedCacheKey(scope: UnreleasedScope = NO_UNRELEASED): string {
    if (scope.all) return 'withUnreleased';
    if (scope.bodyIds.length === 0) return 'onlyReleased';
    return `unreleased:${[...scope.bodyIds].sort().join(',')}`;
}
