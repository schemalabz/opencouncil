import { Prisma, SpeakerContribution } from '@prisma/client';
import type { PersonWithRelations } from '../people';
import { publicAdministrativeBodyRelation } from './administrativeBody';

/** A meeting's transcript is reviewed when it has one of these task statuses. */
export const humanReviewSucceededWhere = { type: 'humanReview', status: 'succeeded' } satisfies Prisma.TaskStatusWhereInput;

/**
 * The subject fields a contribution card reads: its agenda position, its topic
 * and the meeting it belongs to. Both contribution queries select through this
 * constant, so the payload type below cannot drift from the query.
 */
export const contributionSubjectSelect = {
    id: true,
    name: true,
    cityId: true,
    councilMeetingId: true,
    agendaItemIndex: true,
    agendaSectionIndex: true,
    nonAgendaReason: true,
    withdrawn: true,
    topic: true,
    councilMeeting: {
        include: {
            administrativeBody: publicAdministrativeBodyRelation,
            // A count, not the rows: the public page must not receive task ids.
            _count: { select: { taskStatuses: { where: humanReviewSucceededWhere } } },
        },
    },
} satisfies Prisma.SubjectSelect;

export type ContributionSubject = Prisma.SubjectGetPayload<{ select: typeof contributionSubjectSelect }>;

export type ContributionForPerson = SpeakerContribution & {
    speaker: PersonWithRelations | null;
    subject: ContributionSubject;
    /** False until the human review: the card then labels the speaker as unverified. */
    transcriptReviewed: boolean;
};
