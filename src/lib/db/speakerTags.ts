// Not a Server Action module: the browser reaches what it needs, assignSpeaker
// and getSpeakerIdentificationsForMeeting, through src/lib/actions/speakerTags.ts.
import "server-only";
import { Prisma, SpeakerTag } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

/** A reviewer's edit of who speaks: a person, or no person (then the tag shows its label). Without a label, the tag keeps the label it has. */
export type SpeakerEdit = { personId: string | null; label?: string };

/**
 * `allSegments` changes the segment's speaker tag, so every segment that shares
 * the tag changes. `thisSegment` moves the segment to a new tag, so the other
 * segments keep the old one.
 */
export type SpeakerAssignmentScope = 'allSegments' | 'thisSegment';

const speakerIdentificationSelect = {
    speakerTagId: true,
    method: true,
    personId: true,
    actionable: true,
    confidence: true,
    evidence: true,
} satisfies Prisma.SpeakerIdentificationSelect;

export type SpeakerTagIdentification = Prisma.SpeakerIdentificationGetPayload<{ select: typeof speakerIdentificationSelect }>;

/**
 * What each method says about the speakers of a meeting, for the reviewer's
 * editor. This is the only read of speaker identifications that leaves the
 * server, and it requires edit rights.
 */
export async function getSpeakerIdentificationsForMeeting(cityId: string, meetingId: string): Promise<SpeakerTagIdentification[]> {
    await withUserAuthorizedToEdit({ cityId });
    return prisma.speakerIdentification.findMany({
        where: { speakerTag: { speakerSegments: { some: { cityId, meetingId } } } },
        select: speakerIdentificationSelect,
    });
}

/**
 * Sets who speaks in a segment: the write behind the transcript editor's
 * speaker picker. The segment keeps its id in both scopes, so its summary,
 * topic labels and voiceprints stay attached.
 *
 * Either scope makes the tag the reviewer's (`personSetBy: 'user'`): a typed
 * label says who the speaker is as much as a chosen person does, and from then
 * on no automatic pass reassigns it. A tag made for one segment starts without
 * identifications, which describe the diarization speaker the segment was
 * taken from.
 *
 * Returns the speaker tag the segment has after the change.
 */
export async function assignSpeaker(
    speakerSegmentId: string,
    { personId, label }: SpeakerEdit,
    scope: SpeakerAssignmentScope
): Promise<SpeakerTag> {
    const speakerSegment = await prisma.speakerSegment.findUnique({
        where: { id: speakerSegmentId },
        include: { speakerTag: true }
    });

    if (!speakerSegment) {
        throw new Error('Speaker segment not found');
    }

    await withUserAuthorizedToEdit({ cityId: speakerSegment.cityId });

    // Edit rights are per city, and so are people: a meeting's speaker is a
    // person of the meeting's city.
    if (personId !== null) {
        const person = await prisma.person.findFirst({
            where: { id: personId, cityId: speakerSegment.cityId },
            select: { id: true }
        });
        if (!person) {
            throw new Error('Person not found in this city');
        }
    }

    if (scope === 'allSegments') {
        return prisma.speakerTag.update({
            where: { id: speakerSegment.speakerTagId },
            data: { personId, ...(label !== undefined && { label }), personSetBy: 'user' }
        });
    }

    return prisma.speakerTag.create({
        data: {
            label: label ?? speakerSegment.speakerTag.label,
            personId,
            personSetBy: 'user',
            speakerSegments: {
                connect: { id: speakerSegmentId }
            }
        }
    });
}
