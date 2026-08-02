'use server';
import prisma from './prisma';
import { getCurrentUser, withUserAuthorizedToEdit } from '../auth';
import { Utterance } from '@prisma/client';
import { literalReplaceAll } from '../utils/findReplace';

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

/**
 * Batch find & replace across every utterance in a city.
 *
 * Runs inside a single transaction so either every utterance and its audit
 * row commits, or none do. Returns the number of utterances changed and the
 * total number of occurrences replaced (for the toast confirmation).
 */
export async function replaceAllInUtterances(
    cityId: string,
    meetingId: string,
    searchTerm: string,
    replacement: string,
    caseSensitive: boolean,
): Promise<{ utteranceCount: number; occurrenceCount: number }> {
    if (!searchTerm) {
        throw new Error('searchTerm must be non-empty');
    }

    await withUserAuthorizedToEdit({ cityId });
    const user = await getCurrentUser();
    if (!user) {
        throw new Error('User not found');
    }

    // Scope to this meeting only — otherwise replace would touch utterances
    // in every other meeting in the city that happen to contain the term.
    const candidates = await prisma.utterance.findMany({
        where: {
            speakerSegment: { cityId, meetingId },
            text: {
                contains: searchTerm,
                mode: caseSensitive ? 'default' : 'insensitive',
            },
        },
        select: { id: true, text: true },
    });

    const changed: Array<{ id: string; before: string; after: string; count: number }> = [];
    for (const u of candidates) {
        const { text: after, count } = literalReplaceAll(u.text, searchTerm, replacement, caseSensitive);
        if (count === 0 || after === u.text) continue;
        changed.push({ id: u.id, before: u.text, after, count });
    }

    if (changed.length === 0) {
        return { utteranceCount: 0, occurrenceCount: 0 };
    }

    // Chunk the writes — a common term in a large meeting can produce
    // thousands of operations, and stuffing them all into one $transaction
    // risks Postgres parameter limits and long lock-hold times. Each chunk
    // is still atomic; if a later chunk fails earlier ones remain applied.
    const CHUNK_SIZE = 500;
    for (let i = 0; i < changed.length; i += CHUNK_SIZE) {
        const slice = changed.slice(i, i + CHUNK_SIZE);
        const ops = [
            ...slice.map(c =>
                prisma.utterance.update({
                    where: { id: c.id },
                    data: { text: c.after, lastModifiedBy: 'user' },
                }),
            ),
            ...slice.map(c =>
                prisma.utteranceEdit.create({
                    data: {
                        utteranceId: c.id,
                        beforeText: c.before,
                        afterText: c.after,
                        editedBy: 'user',
                        userId: user.id,
                    },
                }),
            ),
        ];
        await prisma.$transaction(ops);
    }

    const occurrenceCount = changed.reduce((sum, c) => sum + c.count, 0);
    return { utteranceCount: changed.length, occurrenceCount };
}
