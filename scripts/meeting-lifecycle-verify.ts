/**
 * Read back the meeting record after the archive backfill (#150). Step 5 of
 * scripts/meeting-record-export.ts. Read-only.
 *
 *   npx tsx scripts/meeting-lifecycle-verify.ts
 *   npx tsx scripts/meeting-lifecycle-verify.ts --audit reports/meeting-lifecycle-apply-<time>.jsonl
 *
 * It prints the counts a person compares with the report, and fails (exit 1)
 * on what would need a rollback: a council-only kind on another body, a kind,
 * an urgency or a number on a later part of a meeting or outside Greece, or a
 * council record whose name says λογοδοσία while it holds another kind.
 *
 * With --audit it also reads the decision poll for the meetings the apply
 * changed: a meeting that the poll now skips but that holds decisions would
 * lose them.
 */
import 'dotenv/config';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { MeetingKind } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { COUNCIL_ONLY_KINDS, recordsGreekCodeFacts } from '@/lib/meetingLifecycleRules';
import { takesNoDecisions } from '@/lib/tasks/pollDecisionsBackoff';
import { analyzeStoredName } from '@/lib/meetingRecordBackfill';

function tally<T>(items: T[], key: (item: T) => string): string {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('audit', { type: 'string', describe: 'An audit file of scripts/meeting-lifecycle-apply.ts' })
        .strict()
        .parse();

    const meetings = await prisma.councilMeeting.findMany({
        select: {
            cityId: true, id: true, name: true, kind: true, urgent: true, sessionNumber: true, format: true, scheduleStatus: true, continuationOfId: true,
            postponedFromId: true, released: true,
            administrativeBody: { select: { name: true, type: true } },
            city: { select: { realm: true } },
            _count: { select: { subjects: true } },
        },
    });

    console.log(`${meetings.length} meetings`);
    console.log(`kind:   ${tally(meetings, (m) => m.kind ?? 'null')}`);
    console.log(`format: ${tally(meetings, (m) => m.format ?? 'null')}`);
    console.log(`status: ${tally(meetings, (m) => m.scheduleStatus)}`);
    const linked = new Set(meetings.filter((m) => m.postponedFromId).map((m) => `${m.cityId}/${m.postponedFromId}`));
    const postponed = meetings.filter((m) => m.scheduleStatus === 'postponed');
    console.log(`postponed: ${postponed.filter((m) => linked.has(`${m.cityId}/${m.id}`)).length} with a new meeting, ${postponed.filter((m) => !linked.has(`${m.cityId}/${m.id}`)).length} without; ${postponed.filter((m) => !m.released).length} unreleased`);
    console.log(`urgent: ${meetings.filter((m) => m.urgent).length}`);
    console.log(`number: ${meetings.filter((m) => m.sessionNumber !== null).length} set`);
    // A stored name shows only on a meeting without a kind (#150).
    console.log(`name:   ${meetings.filter((m) => m.kind === null && m.name !== null).length} shown as stored, ${meetings.filter((m) => m.kind !== null || m.name === null).length} derived`);

    const problems: string[] = [];
    let accountabilityNamesWithoutKind = 0;
    for (const m of meetings) {
        const key = `${m.cityId}/${m.id}`;
        const council = !m.administrativeBody || m.administrativeBody.type === 'council';
        if (m.kind && COUNCIL_ONLY_KINDS.has(m.kind) && !council) problems.push(`${key}: ${m.kind} on a ${m.administrativeBody?.type}`);
        const facts = m.kind !== null || m.urgent || m.sessionNumber !== null;
        if (m.continuationOfId && facts) problems.push(`${key}: a later part with a kind, an urgency or a number`);
        if (!recordsGreekCodeFacts(m.city.realm) && facts) problems.push(`${key}: a kind, an urgency or a number outside Greece`);
        // Only a council holds a λογοδοσία, and a record still without a kind
        // shows its name: a person may not have accepted that row yet.
        if (m.name && council && recordsGreekCodeFacts(m.city.realm)
            && analyzeStoredName(m.name, { bodyName: m.administrativeBody?.name ?? null }).proposedKind === 'accountability') {
            if (m.kind === null) accountabilityNamesWithoutKind++;
            else if (m.kind !== 'accountability') problems.push(`${key}: the name says λογοδοσία, the kind ${m.kind}`);
        }
    }

    if (accountabilityNamesWithoutKind > 0) console.log(`${accountabilityNamesWithoutKind} council records named λογοδοσία have no kind yet.`);

    if (argv.audit) {
        const changed = fs.readFileSync(argv.audit, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
            .filter((line) => line.result === 'applied' || (line.result === 'already-applied' && line.before));
        for (const line of changed) {
            if (line.after.postponedTo && !meetings.some((m) => m.cityId === line.cityId && m.id === line.after.postponedTo && m.postponedFromId === line.id)) {
                problems.push(`${line.cityId}/${line.id}: the link from ${line.after.postponedTo} is missing`);
            }
        }
        const skipped = (record: { kind: MeetingKind | null }) => takesNoDecisions({ kind: record.kind, continuationOf: null });
        const nowSkipped = changed.filter((line) => !skipped(line.before) && skipped(line.after));
        for (const line of nowSkipped) {
            const decisions = await prisma.decision.count({ where: { subject: { cityId: line.cityId, councilMeetingId: line.id } } });
            const note = `${line.cityId}/${line.id}: now skipped by the decision poll (kind ${line.after.kind}), ${decisions} decisions`;
            if (decisions > 0) problems.push(note); else console.log(note);
        }
        console.log(`${changed.length} rows applied; ${nowSkipped.length} newly skipped by the decision poll.`);
    }

    if (problems.length > 0) {
        console.log(`\n${problems.length} problems:\n${problems.map((p) => `  ${p}`).join('\n')}`);
        process.exitCode = 1;
    } else {
        console.log('\nNo problems.');
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
