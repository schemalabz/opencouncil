import { Prisma } from '@prisma/client';
import { PRIMARY_BODY_TYPES } from '@/lib/utils/bodyTier';

/**
 * The raw-SQL twin of `primaryMeetingWhere` (src/lib/utils/bodyTier.ts), over
 * a CouncilMeeting alias. The compiler cannot see the tiers inside a template
 * literal, so the raw queries read the list from the same module.
 */
export function primaryMeetingSql(alias: string): Prisma.Sql {
    const bodyId = Prisma.raw(`"${alias}"."administrativeBodyId"`);
    return Prisma.sql`(${bodyId} IS NULL OR EXISTS (
        SELECT 1 FROM "AdministrativeBody" ab
        WHERE ab.id = ${bodyId} AND ab.type::text IN (${Prisma.join([...PRIMARY_BODY_TYPES])})
    ))`;
}
