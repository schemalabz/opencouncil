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
 * Whether the pipeline of a body's meetings runs without the operators'
 * queues. A youth council brings its own recordings and has no review step:
 * a recording starts the transcription, and the first summary releases the
 * meeting. An operator still asks for the summary, as for every body, and
 * the operators' channel gets every alert of the meeting.
 *
 * The review queue and the upload dashboard leave such a meeting out. Whether
 * a reader sees the transcript before a review is the body's own setting
 * (`showUnreviewedTranscript`), as for every body.
 */
export function pipelineRunsUnattended(body: { type: AdministrativeBodyType } | null | undefined): boolean {
    return isYouthCouncil(body);
}

/**
 * pipelineRunsUnattended as a Prisma where clause. The operators' queues leave
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
