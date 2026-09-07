'use server';
import prisma from './prisma';
import { getCurrentUser, withUserAuthorizedToEdit } from '../auth';
import { Utterance } from '@prisma/client';

type BulkDeleteUtteranceResult = {
    utteranceId: string;
    segmentId: string | null;
};

export async function editUtterance(utteranceId: string, newText: string): Promise<Utterance> {
    try {
        const utterance = await prisma.utterance.findUnique({
            where: { id: utteranceId },
            include: {
                speakerSegment: true
            }
        });

        if (!utterance) {
            throw new Error('Utterance not found');
        }

        await withUserAuthorizedToEdit({ cityId: utterance.speakerSegment.cityId });
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('User not found');
        }

        const updatedUtterance = await prisma.utterance.update({
            where: { id: utteranceId },
            data: {
                text: newText,
                lastModifiedBy: 'user'
            },
        });

        await prisma.utteranceEdit.create({
            data: {
                utteranceId: utteranceId,
                beforeText: utterance.text,
                afterText: newText,
                editedBy: 'user',
                userId: user.id
            }
        });

        return updatedUtterance;
    } catch (error) {
        console.error('Error editing utterance:', error);
        throw new Error('Failed to edit utterance');
    }
}

export async function deleteUtterance(utteranceId: string): Promise<{ segmentId: string | null }> {
    const results = await deleteUtterances([utteranceId]);
    return { segmentId: results[0]?.segmentId ?? null };
}

export async function deleteUtterances(utteranceIds: string[]): Promise<BulkDeleteUtteranceResult[]> {
    try {
        const uniqueUtteranceIds = Array.from(new Set(utteranceIds));
        if (uniqueUtteranceIds.length === 0) {
            return [];
        }

        const utterances = await prisma.utterance.findMany({
            where: { id: { in: uniqueUtteranceIds } },
            select: {
                id: true,
                speakerSegmentId: true,
                speakerSegment: {
                    select: {
                        cityId: true
                    }
                }
            }
        });

        const cityIds = Array.from(new Set(utterances.map(utterance => utterance.speakerSegment.cityId)));
        for (const cityId of cityIds) {
            await withUserAuthorizedToEdit({ cityId });
        }

        const foundUtteranceIds = utterances.map(utterance => utterance.id);
        const affectedSegmentIds = Array.from(new Set(utterances.map(utterance => utterance.speakerSegmentId)));

        await prisma.$transaction(async (tx) => {
            if (foundUtteranceIds.length > 0) {
                await tx.utterance.deleteMany({
                    where: { id: { in: foundUtteranceIds } }
                });
            }

            if (affectedSegmentIds.length === 0) {
                return;
            }

            const remainingUtterances = await tx.utterance.findMany({
                where: {
                    speakerSegmentId: { in: affectedSegmentIds }
                },
                select: {
                    speakerSegmentId: true,
                    startTimestamp: true,
                    endTimestamp: true
                }
            });

            const remainingBySegment = new Map<string, Array<{ startTimestamp: number; endTimestamp: number }>>();
            for (const utterance of remainingUtterances) {
                const segmentUtterances = remainingBySegment.get(utterance.speakerSegmentId);
                if (segmentUtterances) {
                    segmentUtterances.push({
                        startTimestamp: utterance.startTimestamp,
                        endTimestamp: utterance.endTimestamp
                    });
                } else {
                    remainingBySegment.set(utterance.speakerSegmentId, [{
                        startTimestamp: utterance.startTimestamp,
                        endTimestamp: utterance.endTimestamp
                    }]);
                }
            }

            for (const segmentId of affectedSegmentIds) {
                const segmentUtterances = remainingBySegment.get(segmentId);
                if (!segmentUtterances || segmentUtterances.length === 0) {
                    continue;
                }

                const timestamps = segmentUtterances.flatMap((utterance) => [utterance.startTimestamp, utterance.endTimestamp]);
                await tx.speakerSegment.update({
                    where: { id: segmentId },
                    data: {
                        startTimestamp: Math.min(...timestamps),
                        endTimestamp: Math.max(...timestamps)
                    }
                });
            }
        });

        const segmentByUtteranceId = new Map(utterances.map(utterance => [utterance.id, utterance.speakerSegmentId]));
        return uniqueUtteranceIds.map((utteranceId) => ({
            utteranceId,
            segmentId: segmentByUtteranceId.get(utteranceId) ?? null
        }));
    } catch (error) {
        if (error instanceof Error && error.message === 'Not authorized') {
            throw error;
        }
        console.error('Error deleting utterances:', error);
        throw new Error('Failed to delete utterances');
    }
}

export async function updateUtteranceTimestamps(
    utteranceId: string,
    startTimestamp: number,
    endTimestamp: number
): Promise<{ utterance: Utterance; segmentId: string; segmentStartTimestamp: number; segmentEndTimestamp: number }> {
    try {
        const utterance = await prisma.utterance.findUnique({
            where: { id: utteranceId },
            include: {
                speakerSegment: {
                    include: {
                        utterances: true
                    }
                }
            }
        });

        if (!utterance) {
            throw new Error('Utterance not found');
        }

        await withUserAuthorizedToEdit({ cityId: utterance.speakerSegment.cityId });

        // Validate timestamps
        if (startTimestamp >= endTimestamp) {
            throw new Error('Start timestamp must be less than end timestamp');
        }

        if (startTimestamp < 0) {
            throw new Error('Timestamps cannot be negative');
        }

        // Update the utterance
        const updatedUtterance = await prisma.utterance.update({
            where: { id: utteranceId },
            data: {
                startTimestamp,
                endTimestamp
            }
        });

        // Recalculate segment boundaries based on all utterances
        const allUtterances = utterance.speakerSegment.utterances.map(u =>
            u.id === utteranceId
                ? { ...u, startTimestamp, endTimestamp }
                : u
        );

        const allTimestamps = allUtterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
        const newStart = Math.min(...allTimestamps);
        const newEnd = Math.max(...allTimestamps);

        await prisma.speakerSegment.update({
            where: { id: utterance.speakerSegmentId },
            data: {
                startTimestamp: newStart,
                endTimestamp: newEnd
            }
        });

        console.log(`Updated utterance ${utteranceId} timestamps: ${startTimestamp} - ${endTimestamp}. Segment adjusted to ${newStart} - ${newEnd}`);

        return {
            utterance: updatedUtterance,
            segmentId: utterance.speakerSegmentId,
            segmentStartTimestamp: newStart,
            segmentEndTimestamp: newEnd
        };
    } catch (error) {
        console.error('Error updating utterance timestamps:', error);
        throw new Error('Failed to update utterance timestamps');
    }
} 
