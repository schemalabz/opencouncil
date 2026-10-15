import 'server-only';
import prisma from '@/lib/db/prisma';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { transcriptGateSelect, transcriptIsPublic } from '@/lib/db/sharing/publicContent';

/**
 * The vote utterances of a subject, with their speakers. A reader gets them
 * from a public transcript only (see transcriptIsPublic); an editor of the
 * city also gets them from a draft or an unreviewed transcript. Only utterances of
 * the subject's own meeting count.
 */
export async function getVotingUtterances(subjectId: string) {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { cityId: true, councilMeetingId: true, councilMeeting: { select: { ...transcriptGateSelect, released: true } } },
    });
    if (!subject) return [];
    const { councilMeeting } = subject;
    if ((!councilMeeting.released || !transcriptIsPublic(councilMeeting))
        && !(await isUserAuthorizedToEdit({ cityId: subject.cityId }))) {
        return [];
    }

    return prisma.utterance.findMany({
        where: {
            discussionSubjectId: subjectId,
            discussionStatus: 'VOTE',
            // The gate above read the meeting of the subject: no utterance
            // of another meeting passes through it.
            speakerSegment: { cityId: subject.cityId, meetingId: subject.councilMeetingId },
        },
        select: {
            id: true,
            text: true,
            startTimestamp: true,
            endTimestamp: true,
            speakerSegment: {
                select: {
                    id: true,
                    speakerTagId: true,
                    speakerTag: {
                        select: {
                            id: true,
                            label: true,
                            personId: true,
                            person: {
                                select: {
                                    id: true,
                                    name: true,
                                    image: true,
                                    roles: {
                                        include: {
                                            party: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        orderBy: {
            startTimestamp: 'asc'
        }
    });
}
