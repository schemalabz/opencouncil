'use server';
import prisma from './prisma';
import { getCurrentUser, withUserAuthorizedToEdit } from '../auth';
import { Utterance } from '@prisma/client';

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

export async function deleteUtterance(utteranceId: string): Promise<{ segmentId: string, remainingUtterances: number }> {
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

        const segmentId = utterance.speakerSegmentId;
        const remainingUtterances = utterance.speakerSegment.utterances.filter(u => u.id !== utteranceId);

        // Delete the utterance
        await prisma.utterance.delete({
            where: { id: utteranceId }
        });

        // If there are remaining utterances, recalculate segment timestamps
        if (remainingUtterances.length > 0) {
            const allTimestamps = remainingUtterances.flatMap(u => [u.startTimestamp, u.endTimestamp]);
            const newStart = Math.min(...allTimestamps);
            const newEnd = Math.max(...allTimestamps);

            await prisma.speakerSegment.update({
                where: { id: segmentId },
                data: {
                    startTimestamp: newStart,
                    endTimestamp: newEnd
                }
            });
        }

        console.log(`Deleted utterance ${utteranceId} from segment ${segmentId}. Remaining: ${remainingUtterances.length}`);
        
        return { segmentId, remainingUtterances: remainingUtterances.length };
    } catch (error) {
        console.error('Error deleting utterance:', error);
        throw new Error('Failed to delete utterance');
    }
}

export async function deleteMultipleUtterances(utteranceIds: string[]): Promise<{ affectedSegments: { segmentId: string; remainingUtterances: number }[] }> {
    if (utteranceIds.length === 0) {
        return { affectedSegments: [] };
    }

    try {
        // Fetch all utterances with their segments
        const utterances = await prisma.utterance.findMany({
            where: { id: { in: utteranceIds } },
            include: {
                speakerSegment: {
                    include: {
                        utterances: true
                    }
                }
            }
        });

        if (utterances.length === 0) {
            throw new Error('No utterances found');
        }

        // Authorize based on the first utterance's city (all should be same city)
        await withUserAuthorizedToEdit({ cityId: utterances[0].speakerSegment.cityId });

        const idsToDelete = new Set(utterances.map(u => u.id));

        // Group by segment to compute remaining utterances after deletion
        const segmentMap = new Map<string, { allUtterances: typeof utterances[0]['speakerSegment']['utterances']; deletingIds: Set<string> }>();
        for (const utterance of utterances) {
            const segId = utterance.speakerSegmentId;
            if (!segmentMap.has(segId)) {
                segmentMap.set(segId, { allUtterances: utterance.speakerSegment.utterances, deletingIds: new Set() });
            }
            segmentMap.get(segId)!.deletingIds.add(utterance.id);
        }

        // Delete all utterances in one query
        await prisma.utterance.deleteMany({
            where: { id: { in: utteranceIds } }
        });

        // Recalculate timestamps for affected segments
        const affectedSegments: { segmentId: string; remainingUtterances: number }[] = [];
        for (const [segmentId, { allUtterances, deletingIds }] of segmentMap) {
            const remaining = allUtterances.filter(u => !deletingIds.has(u.id));
            affectedSegments.push({ segmentId, remainingUtterances: remaining.length });

            if (remaining.length > 0) {
                const allTimestamps = remaining.flatMap(u => [u.startTimestamp, u.endTimestamp]);
                await prisma.speakerSegment.update({
                    where: { id: segmentId },
                    data: {
                        startTimestamp: Math.min(...allTimestamps),
                        endTimestamp: Math.max(...allTimestamps)
                    }
                });
            }
        }

        console.log(`Deleted ${utteranceIds.length} utterances across ${segmentMap.size} segments`);
        return { affectedSegments };
    } catch (error) {
        console.error('Error deleting multiple utterances:', error);
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