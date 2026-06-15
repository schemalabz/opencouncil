/**
 * Replay a failed summarize task without re-running it on the tasks server.
 *
 * When result processing fails, handleTaskUpdate stores the error followed by the
 * original task server response in responseBody. This script extracts that response,
 * removes entries the LLM corrupted (missing speakerSegmentId / utteranceId after
 * undefined fields were dropped in serialization), and restores the task to
 * 'succeeded' with the cleaned response.
 *
 * Afterwards, apply the result via the admin UI "Reprocess" button on the task.
 *
 * Usage:
 *   npx tsx scripts/replay-summarize.ts <cityId> <meetingId>           # dry run
 *   npx tsx scripts/replay-summarize.ts <cityId> <meetingId> --write   # apply
 */
import prisma from '../src/lib/db/prisma';

const RESPONSE_SEPARATOR = '--- Original task server response ---';

function extractOriginalResponse(responseBody: string): string {
    const idx = responseBody.indexOf(RESPONSE_SEPARATOR);
    if (idx === -1) {
        throw new Error(`No "${RESPONSE_SEPARATOR}" separator found — is this a processing failure?`);
    }
    return responseBody.slice(idx + RESPONSE_SEPARATOR.length).trim();
}

function cleanResponse(raw: string): { cleaned: string; dropped: string[] } {
    const result = JSON.parse(raw);
    const dropped: string[] = [];

    result.speakerSegmentSummaries = result.speakerSegmentSummaries.filter((s: any) => {
        if (s.speakerSegmentId === undefined) {
            dropped.push(`speakerSegmentSummary: ${JSON.stringify(s).slice(0, 120)}`);
            return false;
        }
        return true;
    });

    result.subjects = result.subjects.filter((s: any) => {
        if (s.id === undefined) {
            dropped.push(`subject: "${s.name}"`);
            return false;
        }
        return true;
    });

    result.utteranceDiscussionStatuses = result.utteranceDiscussionStatuses.filter((u: any) => {
        if (u.utteranceId === undefined) {
            dropped.push(`utteranceDiscussionStatus: ${JSON.stringify(u).slice(0, 120)}`);
            return false;
        }
        return true;
    });

    return { cleaned: JSON.stringify(result), dropped };
}

async function main() {
    const [cityId, meetingId] = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const write = process.argv.includes('--write');

    if (!cityId || !meetingId) {
        console.error('Usage: npx tsx scripts/replay-summarize.ts <cityId> <meetingId> [--write]');
        process.exit(1);
    }

    const task = await prisma.taskStatus.findFirst({
        where: { cityId, councilMeetingId: meetingId, type: 'summarize' },
        orderBy: { createdAt: 'desc' },
    });

    if (!task) {
        console.error(`No summarize task found for ${cityId}/${meetingId}`);
        process.exit(1);
    }

    console.log(`Found task: ${task.id} (status: ${task.status}, updated: ${task.updatedAt})`);

    if (task.status !== 'failed') {
        console.error(`Task is '${task.status}', expected 'failed' — aborting`);
        process.exit(1);
    }
    if (!task.responseBody) {
        console.error('Task has no responseBody — nothing to replay');
        process.exit(1);
    }

    const errorMessage = task.responseBody.slice(0, task.responseBody.indexOf('\n'));
    console.log(`Stored error: ${errorMessage.slice(0, 200)}`);

    const original = extractOriginalResponse(task.responseBody);
    const { cleaned, dropped } = cleanResponse(original);

    console.log(`\nOriginal response: ${original.length} chars`);
    console.log(`Cleaned response:  ${cleaned.length} chars`);
    console.log(`Dropped ${dropped.length} corrupted entries:`);
    dropped.forEach(d => console.log(`  - ${d}`));

    if (!write) {
        console.log(`\nDry run — re-run with --write to update the task.`);
    } else {
        await prisma.taskStatus.update({
            where: { id: task.id },
            data: { status: 'succeeded', responseBody: cleaned },
        });
        console.log(`\nTask ${task.id} updated to 'succeeded' with cleaned response.`);
        console.log(`Now apply it: admin UI → ${cityId}/${meetingId} → tasks → Reprocess.`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
