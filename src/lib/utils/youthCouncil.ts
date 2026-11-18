import type { AdministrativeBodyType, Prisma } from '@prisma/client';

/**
 * The rules that exist for youth councils (#829). They read the type of the
 * body, never its tier: an admin can set a youth council to the primary tier,
 * and a body of another type to the secondary tier, and neither change moves
 * these rules. Where content shows is the tier's job (bodyTier.ts).
 *
 * Type-only Prisma imports, so this is safe in client components too.
 */

export function isYouthCouncil(body: { type: AdministrativeBodyType } | null | undefined): boolean {
    return body?.type === 'youthCouncil';
}

/**
 * Whether the pipeline of a body's meetings runs with no operator. A youth
 * council runs its own meetings: a recording starts the transcription, the
 * summary follows the corrected transcript, and the meeting is released when
 * the summary lands. Nobody reviews the transcript first, so the page shows it
 * unreviewed. Every other body keeps the human review step.
 *
 * The operator surfaces read this rule too: the review queue, the upload
 * dashboard and the alerts to the operators' channel leave such a meeting out.
 */
export function pipelineRunsUnattended(body: { type: AdministrativeBodyType } | null | undefined): boolean {
    return isYouthCouncil(body);
}

/**
 * pipelineRunsUnattended as a Prisma where clause. The operator surfaces leave
 * these meetings out with `NOT`, which keeps a meeting with no body.
 */
export const unattendedMeetingWhere = {
    administrativeBody: { type: 'youthCouncil' as const },
} satisfies Prisma.CouncilMeetingWhereInput;

/**
 * Whether every role of the person is on a youth council. A youth council has
 * members under 18, so such a person consents to a voiceprint and adds their
 * photo from their own account only: no admin records the consent or starts
 * the voiceprint without it, and no admin sets the photo. A person with any
 * other role keeps the rules of everyone else.
 */
export function youthCouncilOnly(
    roles: { administrativeBody?: { type: AdministrativeBodyType } | null }[],
): boolean {
    return roles.length > 0 && roles.every(role => isYouthCouncil(role.administrativeBody));
}
