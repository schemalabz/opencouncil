// Not a Server Action module: the browser reaches replaceAllInUtterances
// through src/lib/actions/utterances.ts.
import "server-only";
import prisma from './prisma';
import { getCurrentUser, withUserAuthorizedToEdit } from '../auth';
import { literalReplaceAll } from '@/lib/utils/findReplace';

/**
 * Batch find & replace across every utterance in a meeting.
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
        // Stable order keeps chunk boundaries deterministic.
        orderBy: { id: 'asc' },
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

    // One statement per chunk keeps a common term in a large meeting from
    // issuing thousands of sequential row updates inside the transaction, and
    // chunking bounds each statement's size. All chunks share one transaction
    // so a failure part-way rolls back every earlier chunk too.
    const CHUNK_SIZE = 500;
    await prisma.$transaction(async (tx) => {
        for (let i = 0; i < changed.length; i += CHUNK_SIZE) {
            const slice = changed.slice(i, i + CHUNK_SIZE);
            await tx.$executeRaw`
                UPDATE "Utterance" AS u
                SET "text" = d.after, "lastModifiedBy" = 'user', "updatedAt" = NOW()
                FROM unnest(${slice.map(c => c.id)}::text[], ${slice.map(c => c.after)}::text[]) AS d(id, after)
                WHERE u.id = d.id`;
            await tx.utteranceEdit.createMany({
                data: slice.map(c => ({
                    utteranceId: c.id,
                    beforeText: c.before,
                    afterText: c.after,
                    editedBy: 'user' as const,
                    userId: user.id,
                })),
            });
        }
    }, {
        maxWait: 10_000,
        timeout: 60_000,
    });

    const occurrenceCount = changed.reduce((sum, c) => sum + c.count, 0);
    return { utteranceCount: changed.length, occurrenceCount };
}
