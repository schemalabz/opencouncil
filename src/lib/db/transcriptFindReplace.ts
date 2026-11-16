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
 * total number of occurrences replaced (for the toast confirmation), and the
 * new text of each utterance it wrote, so the editor updates only those.
 */
export async function replaceAllInUtterances(
    cityId: string,
    meetingId: string,
    searchTerm: string,
    replacement: string,
    caseSensitive: boolean,
): Promise<{ utteranceCount: number; occurrenceCount: number; updated: Array<{ id: string; text: string }> }> {
    if (!searchTerm) {
        throw new Error('searchTerm must be non-empty');
    }

    await withUserAuthorizedToEdit({ cityId, councilMeetingId: meetingId });
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
        return { utteranceCount: 0, occurrenceCount: 0, updated: [] };
    }

    // One statement per chunk keeps a common term in a large meeting from
    // issuing thousands of sequential row updates inside the transaction, and
    // chunking bounds each statement's size. All chunks share one transaction
    // so a failure part-way rolls back every earlier chunk too.
    //
    // The matches were read outside the transaction. The UPDATE writes a row
    // only if its text is still the text we read, so a save that another
    // editor made in between is kept. Only the rows it wrote get an audit row
    // and count in the result.
    const CHUNK_SIZE = 500;
    const applied = await prisma.$transaction(async (tx) => {
        const written: typeof changed = [];
        for (let i = 0; i < changed.length; i += CHUNK_SIZE) {
            const chunk = changed.slice(i, i + CHUNK_SIZE);
            const rows = await tx.$queryRaw<Array<{ id: string }>>`
                UPDATE "Utterance" AS u
                SET "text" = d.after, "lastModifiedBy" = 'user', "updatedAt" = NOW()
                FROM unnest(${chunk.map(c => c.id)}::text[], ${chunk.map(c => c.before)}::text[], ${chunk.map(c => c.after)}::text[]) AS d(id, before, after)
                WHERE u.id = d.id AND u."text" = d.before
                RETURNING u.id`;
            const writtenIds = new Set(rows.map(r => r.id));
            const slice = chunk.filter(c => writtenIds.has(c.id));
            written.push(...slice);
            if (slice.length === 0) continue;
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
        return written;
    }, {
        maxWait: 10_000,
        timeout: 60_000,
    });

    const occurrenceCount = applied.reduce((sum, c) => sum + c.count, 0);
    return {
        utteranceCount: applied.length,
        occurrenceCount,
        updated: applied.map(c => ({ id: c.id, text: c.after })),
    };
}
