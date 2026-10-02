// Not a Server Action module: the browser reaches the one write it needs,
// assignSpeaker, through src/lib/actions/speakerTags.ts.
import "server-only";
import { SpeakerTag } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from '../auth';

/** Who speaks: a person, or no person (then the tag shows its label). Without a label, the tag keeps the label it has. */
export type SpeakerAssignment = { personId: string | null; label?: string };

/**
 * `allSegments` changes the segment's speaker tag, so every segment that shares
 * the tag changes. `thisSegment` moves the segment to a new tag, so the other
 * segments keep the old one.
 */
export type SpeakerAssignmentScope = 'allSegments' | 'thisSegment';

/**
 * Sets who speaks in a segment: the write behind the transcript editor's
 * speaker picker. The segment keeps its id in both scopes, so its summary,
 * topic labels and voiceprints stay attached.
 *
 * Returns the speaker tag the segment has after the change.
 */
export async function assignSpeaker(
    speakerSegmentId: string,
    { personId, label }: SpeakerAssignment,
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

    if (scope === 'allSegments') {
        return prisma.speakerTag.update({
            where: { id: speakerSegment.speakerTagId },
            data: { personId, ...(label !== undefined && { label }) }
        });
    }

    return prisma.speakerTag.create({
        data: {
            label: label ?? speakerSegment.speakerTag.label,
            personId,
            speakerSegments: {
                connect: { id: speakerSegmentId }
            }
        }
    });
}
