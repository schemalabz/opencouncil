/**
 * Apply the reviewed rows of the meeting record report (#150).
 *
 *   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/meeting-lifecycle-apply.ts --csv reports/meeting-lifecycle.csv
 *   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/meeting-lifecycle-apply.ts --csv reports/meeting-lifecycle.csv --apply
 *
 * Only rows with `apply` = `yes` count. Without --apply the script prints what
 * it would change and writes nothing. With --apply, each row is one
 * transaction: lock the row, compare every field that the script writes with
 * the `current*` value of the report, and write through the lifecycle module,
 * so the rules of the record run on old data too. A row that changed since
 * the report is skipped, and a second run of the same CSV changes nothing.
 * Every committed row is appended to an audit file, and a run with --apply
 * also records the rows that it finds already applied. So a second run
 * records a row whose audit line a failed first run did not write.
 *
 * The script writes the name override, the status, the kind, the session
 * number and the format. It never writes links, visibility or reasons. After
 * a status change it syncs the Google Calendar event; a past meeting emails
 * nobody. The sync never throws: a failure goes to the admin alert, and a
 * second run with --resync-calendar syncs the rows whose status the backfill
 * changed, including the rows that it finds already applied. The Next.js cache of the site is not reachable from here, so the
 * pages show the change after the next deploy or when their cache expires.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { updateMeetingRecord, type MeetingRecordFields } from '@/lib/db/meetingLifecycle';
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { parseCsvFile } from './lib/csv';
import { assertNotProduction, type ReportRow } from './lib/meetingLifecycleCsv';

type Patch = Pick<MeetingRecordFields, 'name' | 'name_en' | 'scheduleStatus' | 'kind' | 'sessionNumber' | 'format'>;

const orNull = (value: string) => (value === '' ? null : value);

/** The values that the reviewed row asks for. */
function target(row: ReportRow): Patch {
    return {
        name: orNull(row.proposedName),
        name_en: orNull(row.proposedNameEn),
        scheduleStatus: row.proposedStatus as MeetingScheduleStatus,
        kind: orNull(row.proposedKind) as MeetingKind | null,
        sessionNumber: row.proposedSessionNumber === '' ? null : Number(row.proposedSessionNumber),
        format: row.proposedFormat as MeetingFormat,
    };
}

/** The values that the report read, to detect a change since the review. */
function reviewed(row: ReportRow): Patch {
    return {
        name: orNull(row.currentName),
        name_en: orNull(row.currentNameEn),
        scheduleStatus: row.currentStatus as MeetingScheduleStatus,
        kind: orNull(row.currentKind) as MeetingKind | null,
        sessionNumber: row.currentSessionNumber === '' ? null : Number(row.currentSessionNumber),
        format: row.currentFormat as MeetingFormat,
    };
}

const FIELDS = ['name', 'name_en', 'scheduleStatus', 'kind', 'sessionNumber', 'format'] as const;

function differs(a: Patch, b: Patch) {
    return FIELDS.filter((field) => a[field] !== b[field]);
}

type Outcome = 'applied' | 'already-applied' | 'changed-since-report' | 'refused' | 'not-found' | 'would-apply';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('csv', { type: 'string', demandOption: true, describe: 'The reviewed report' })
        .option('apply', { type: 'boolean', default: false, describe: 'Write the changes (default: dry run)' })
        .option('audit', { type: 'string', describe: 'Where to append the audit lines' })
        .option('resync-calendar', { type: 'boolean', default: false, describe: 'Also sync the calendar of already-applied rows whose status the report changes' })
        .option('i-know-this-is-production', { type: 'boolean', default: false })
        .strict()
        .parse();
    assertNotProduction(argv['i-know-this-is-production']);

    const rows = (await parseCsvFile(argv.csv)) as ReportRow[];
    const accepted = rows.filter((row) => row.apply?.toLowerCase() === 'yes');
    const auditFile = argv.audit ?? path.join(path.dirname(argv.csv), `meeting-lifecycle-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    const counts: Record<Outcome, number> = { applied: 0, 'already-applied': 0, 'changed-since-report': 0, refused: 0, 'not-found': 0, 'would-apply': 0 };
    console.log(`${accepted.length} of ${rows.length} rows accepted; ${argv.apply ? 'applying' : 'dry run'}.`);

    for (const row of accepted) {
        const wanted = target(row);
        let outcome: Outcome;
        let before: Patch | null = null;
        try {
            outcome = await prisma.$transaction(async (tx) => {
                // Lock the row, so an admin edit cannot slip between the check and the write.
                await tx.$queryRaw`SELECT id FROM "CouncilMeeting" WHERE "cityId" = ${row.cityId} AND id = ${row.id} FOR UPDATE`;
                const current = await tx.councilMeeting.findUnique({
                    where: { cityId_id: { cityId: row.cityId, id: row.id } },
                    select: { name: true, name_en: true, scheduleStatus: true, kind: true, sessionNumber: true, format: true },
                });
                if (!current) return 'not-found';
                before = current;
                const changes = differs(current, wanted);
                if (changes.length === 0) return 'already-applied';
                if (differs(current, reviewed(row)).length > 0) return 'changed-since-report';
                console.log(`${row.cityId}/${row.id}: ${changes.map((field) => `${field} ${JSON.stringify(current[field])} → ${JSON.stringify(wanted[field])}`).join('; ')}`);
                if (!argv.apply) return 'would-apply';
                await updateMeetingRecord(row.cityId, row.id, wanted, { tx });
                return 'applied';
            });
        } catch (error) {
            if (!(error instanceof LifecycleRuleError)) throw error;
            console.error(`${row.cityId}/${row.id}: refused (${error.code}): ${error.message}`);
            outcome = 'refused';
        }
        counts[outcome]++;

        if (outcome === 'applied') {
            fs.appendFileSync(auditFile, JSON.stringify({ cityId: row.cityId, id: row.id, result: 'applied', before, after: wanted, at: new Date().toISOString() }) + '\n');
            if (before && (before as Patch).scheduleStatus !== wanted.scheduleStatus) {
                await syncMeetingToCalendar(row.cityId, row.id);
            }
        } else if (outcome === 'already-applied' && argv.apply) {
            fs.appendFileSync(auditFile, JSON.stringify({ cityId: row.cityId, id: row.id, result: 'already-applied', state: wanted, at: new Date().toISOString() }) + '\n');
            if (argv['resync-calendar'] && row.currentStatus !== wanted.scheduleStatus) {
                await syncMeetingToCalendar(row.cityId, row.id);
            }
        } else if (outcome !== 'would-apply' && outcome !== 'already-applied') {
            console.log(`${row.cityId}/${row.id}: ${outcome}`);
        }
    }

    console.log(Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(', ') || 'nothing to do');
    if (counts.applied > 0) console.log(`Audit: ${auditFile}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
