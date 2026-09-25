import { Prisma, SpeakerContribution } from '@prisma/client';
import type { PersonWithRelations } from '../people';

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
        include: { administrativeBody: true },
    },
} satisfies Prisma.SubjectSelect;

export type ContributionSubject = Prisma.SubjectGetPayload<{ select: typeof contributionSubjectSelect }>;

export type ContributionForPerson = SpeakerContribution & {
    speaker: PersonWithRelations | null;
    subject: ContributionSubject;
};
