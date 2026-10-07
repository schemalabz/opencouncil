import type { AdministrativeBodyType, Prisma } from '@prisma/client';

/**
 * The meetings of administrative bodies of these types. A meeting with no body
 * (cities imported before bodies existed) reads as the council's, as it does
 * everywhere else in the app (see timelineSide), so asking for the council
 * admits it too. A relation filter alone would drop it. The search applies the
 * same rule to its index in buildFilters.
 */
export function meetingBodyTypeWhere(types: AdministrativeBodyType[]): Prisma.CouncilMeetingWhereInput {
    return types.includes('council')
        ? { OR: [{ administrativeBody: { type: { in: types } } }, { administrativeBodyId: null }] }
        : { administrativeBody: { type: { in: types } } };
}
