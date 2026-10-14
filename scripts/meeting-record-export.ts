/**
 * Export the meetings whose invitation the archive backfill of the meeting
 * record reads (#150). Step 1 of 4:
 *
 *   1. this script                                   → reports/meeting-record-export.json
 *   2. opencouncil-tasks: npm run cli -- read-meeting-records reports/meeting-record-export.json -O reports/meeting-records.json
 *   3. scripts/meeting-lifecycle-report.ts --records reports/meeting-records.json → a CSV to review
 *   4. scripts/meeting-lifecycle-apply.ts --csv … (dry run, then --apply)
 *
 *   npx tsx scripts/meeting-record-export.ts                              # every meeting with an agenda
 *   npx tsx scripts/meeting-record-export.ts --city athens --city chania
 *   npx tsx scripts/meeting-record-export.ts --supported --per-body 4     # a sample to measure first
 *
 * --per-body N keeps N meetings of each body, spread across its history so the
 * sample covers invitations whose wording changed over time, and every meeting
 * whose name marks a special or urgent sitting, which are rare. Only Greek
 * cities: the kind, the urgency and the number are facts of the Greek Code.
 * Read-only.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { analyzeStoredName } from '@/lib/meetingRecordBackfill';
import { formatClockTime, localCalendarDate } from '@/lib/formatters/time';

/** At most this many name-marked meetings of one body join a sample. */
const MARKED_PER_BODY = 3;

/** `count` items spread evenly over `items`, first and last included. */
function spread<T>(items: T[], count: number): T[] {
    if (items.length <= count) return items;
    if (count === 1) return [items[items.length - 1]];
    return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('out', { type: 'string', default: 'reports/meeting-record-export.json' })
        .option('city', { type: 'string', array: true, describe: 'Only these city ids' })
        .option('supported', { type: 'boolean', default: false, describe: 'Only the cities whose status is supported' })
        .option('per-body', { type: 'number', describe: 'Sample this many meetings of each body (see above)' })
        .strict()
        .parse();

    const meetings = await prisma.councilMeeting.findMany({
        where: {
            agendaUrl: { not: null },
            city: { realm: 'greece', ...(argv.supported ? { status: 'supported' } : {}) },
            ...(argv.city ? { cityId: { in: argv.city } } : {}),
        },
        select: {
            id: true, cityId: true, name: true, dateTime: true, agendaUrl: true, administrativeBodyId: true,
            administrativeBody: { select: { name: true, type: true } },
            city: { select: { timezone: true } },
        },
        orderBy: [{ cityId: 'asc' }, { dateTime: 'asc' }],
    });

    let chosen = meetings;
    if (argv['per-body']) {
        const byBody = new Map<string, typeof meetings>();
        for (const m of meetings) {
            const key = `${m.cityId}/${m.administrativeBodyId ?? '-'}`;
            byBody.set(key, [...(byBody.get(key) ?? []), m]);
        }
        const picked = new Set<typeof meetings[number]>();
        for (const group of byBody.values()) {
            spread(group, argv['per-body']).forEach((m) => picked.add(m));
            const marked = group.filter((m) => {
                if (!m.name) return false;
                const analysis = analyzeStoredName(m.name, { bodyName: m.administrativeBody?.name ?? null });
                return analysis.proposedKind || analysis.urgent || analysis.note === 'special-unknown' || analysis.combined;
            });
            spread(marked, MARKED_PER_BODY).forEach((m) => picked.add(m));
        }
        chosen = meetings.filter((m) => picked.has(m));
        console.log(`${byBody.size} bodies, ${chosen.length} of ${meetings.length} meetings sampled`);
    }

    const payload = {
        exportedAt: new Date().toISOString(),
        meetings: chosen.map((m) => ({
            cityId: m.cityId,
            meetingId: m.id,
            // The calendar date of the city: a sitting at midnight is on the
            // day the invitation prints, not on the UTC day before it.
            date: localCalendarDate(m.dateTime, m.city.timezone),
            // Tells two meetings of one body on one day apart.
            time: formatClockTime(m.dateTime, m.city.timezone),
            agendaUrl: m.agendaUrl as string,
            administrativeBody: m.administrativeBody,
        })),
    };
    fs.mkdirSync(path.dirname(argv.out), { recursive: true });
    fs.writeFileSync(argv.out, JSON.stringify(payload, null, 2));
    console.log(`${payload.meetings.length} meetings → ${argv.out}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
