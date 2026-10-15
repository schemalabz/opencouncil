/**
 * Apply the reviewed rows of the meeting record report (#150).
 *
 *   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/meeting-lifecycle-apply.ts --csv reports/meeting-lifecycle.csv
 *   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/meeting-lifecycle-apply.ts --csv reports/meeting-lifecycle.csv --apply
 *   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/meeting-lifecycle-apply.ts --rollback reports/meeting-lifecycle-apply-<time>.jsonl [--apply]
 *
 * Only rows with `apply` = `yes` count. Without --apply the script prints what
 * it would change and writes nothing. With --apply, each row is one
 * transaction: lock the row, compare every field that the script writes with
 * the `current*` value of the report, and write through the lifecycle module,
 * so the rules of the record run on old data too. A row that changed since
 * the report is skipped, and a second run of the same CSV changes nothing.
 * Every accepted row is checked before the first write: a value the CSV
 * cannot hold, or a held kind, number or urgency that it would replace,
 * stops the run with nothing written. Every committed row is appended to an
 * audit file, and a run with --apply also records, with the reviewed values
 * as `before`, the rows that it finds already applied. So a second run
 * records a row whose audit line a failed first run did not write, and the
 * rollback can restore it.
 *
 * The script writes the status, the kind, the urgency, the session number
 * and the format. It never writes a name (#150): the stored names stay as the
 * legacy fallback. It writes one link: a postponed meeting's new meeting
 * (`proposedPostponedTo`) gets `postponedFromId`, in the same transaction as
 * the status, through the same rules as the admin form. When the new meeting
 * is public, the link unreleases the postponed one, as a release would. It
 * never writes visibility otherwise, or reasons. When the
 * status or the derived title changes it syncs the Google Calendar event; a
 * past meeting emails nobody. The sync never throws: a failure goes to the
 * admin alert, and a second run with --resync-calendar syncs the rows that it
 * finds already applied. The Next.js cache of the site is not reachable from
 * here, so the pages show the change after the next deploy or when their
 * cache expires.
 *
 * --rollback reads an audit file and restores the `before` of each applied
 * row, newest first, through the same lifecycle write and the same row lock.
 * It removes a link before it restores the status, which shows the postponed
 * meeting again when the link had hidden it.
 * A row restores only while it still holds the `after` that the apply wrote:
 * one that changed since (an admin's edit, a processAgenda run) is skipped
 * and listed, and one already back at `before` counts as done, so a second
 * rollback changes nothing. It is a dry run without --apply, and writes its
 * own audit file.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MeetingFormat, MeetingKind, MeetingScheduleStatus, type Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { updateMeetingRecord, type MeetingRecordFields } from '@/lib/db/meetingLifecycle';
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { parseCsvFile } from './lib/csv';
import { assertNotProduction, type ReportRow } from './lib/meetingLifecycleCsv';

type Patch = Pick<MeetingRecordFields, 'scheduleStatus' | 'kind' | 'urgent' | 'sessionNumber' | 'format'>;
/** The fields of a row, and the new meeting that a postponed one links to. */
type RowState = Patch & { postponedTo: string | null };

const empty = z.literal('').transform(() => null);
/** A person edits the CSV before the apply, so every value is checked before the first write. */
const values = z.object({
    scheduleStatus: z.nativeEnum(MeetingScheduleStatus),
    kind: empty.or(z.nativeEnum(MeetingKind)),
    urgent: z.enum(['yes', '']).transform((v) => v === 'yes'),
    sessionNumber: empty.or(z.string().regex(/^[1-9]\d{0,2}$/, 'a whole number').transform(Number)),
    format: empty.or(z.nativeEnum(MeetingFormat)),
    postponedTo: empty.or(z.string().regex(/^\S+$/, 'a meeting id')),
});

function patchOf(row: ReportRow, side: 'proposed' | 'current'): RowState {
    return values.parse({
        scheduleStatus: side === 'proposed' ? row.proposedStatus : row.currentStatus,
        kind: side === 'proposed' ? row.proposedKind : row.currentKind,
        urgent: side === 'proposed' ? row.proposedUrgent : row.currentUrgent,
        sessionNumber: side === 'proposed' ? row.proposedSessionNumber : row.currentSessionNumber,
        format: side === 'proposed' ? row.proposedFormat : row.currentFormat,
        postponedTo: side === 'proposed' ? row.proposedPostponedTo : row.currentPostponedTo,
    });
}

const fieldsOf = ({ postponedTo: _link, ...fields }: RowState): Patch => fields;

/** The values that the reviewed row asks for. */
const target = (row: ReportRow) => patchOf(row, 'proposed');
/** The values that the report read, to detect a change since the review. */
const reviewed = (row: ReportRow) => patchOf(row, 'current');

/**
 * Why a reviewed row cannot be applied: a value that is not valid, or a held
 * kind, number or urgency that it would replace. The backfill only fills
 * them; a person changes a held value in the admin form.
 */
function rowProblem(row: ReportRow): string | null {
    let wanted: RowState, held: RowState;
    try {
        wanted = target(row);
        held = reviewed(row);
    } catch (error) {
        return error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(error);
    }
    if (held.kind !== null && wanted.kind !== held.kind) return `replaces the held kind ${held.kind}`;
    if (held.sessionNumber !== null && wanted.sessionNumber !== held.sessionNumber) return `replaces the held number ${held.sessionNumber}`;
    if (held.urgent && !wanted.urgent) return 'drops the held urgency';
    if (held.scheduleStatus !== 'scheduled' && wanted.scheduleStatus !== held.scheduleStatus) return `replaces the held status ${held.scheduleStatus}`;
    if (held.postponedTo !== null && wanted.postponedTo !== held.postponedTo) return `replaces the held link to ${held.postponedTo}`;
    if (wanted.postponedTo !== null && wanted.scheduleStatus !== 'postponed') return 'links a new meeting to a meeting that is not postponed';
    return null;
}

/** The fields that the derived title, and so the calendar event, is made of. */
const titleChanges = (a: Patch, b: Patch) => a.kind !== b.kind || a.urgent !== b.urgent || a.sessionNumber !== b.sessionNumber || a.scheduleStatus !== b.scheduleStatus;

const FIELDS = ['scheduleStatus', 'kind', 'urgent', 'sessionNumber', 'format', 'postponedTo'] as const;

/** An audit file of an earlier version has no link: none was written. */
function differs(a: RowState, b: RowState) {
    return FIELDS.filter((field) => (a[field] ?? null) !== (b[field] ?? null));
}

/** The row and the meeting that is linked to it as its new meeting, locked. */
async function lockState(tx: Prisma.TransactionClient, cityId: string, id: string): Promise<{ state: RowState; released: boolean } | null> {
    await tx.$queryRaw`SELECT id FROM "CouncilMeeting" WHERE "cityId" = ${cityId} AND (id = ${id} OR "postponedFromId" = ${id}) FOR UPDATE`;
    const row = await tx.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id } },
        select: { scheduleStatus: true, kind: true, urgent: true, sessionNumber: true, format: true, released: true },
    });
    if (!row) return null;
    const link = await tx.councilMeeting.findFirst({ where: { cityId, postponedFromId: id }, select: { id: true } });
    const { released, ...fields } = row;
    return { state: { ...fields, postponedTo: link?.id ?? null }, released };
}

/** Moves the link of a postponed meeting from one new meeting to another, either of which may be none. */
async function relink(tx: Prisma.TransactionClient, cityId: string, postponedId: string, from: string | null, to: string | null) {
    if ((from ?? null) === (to ?? null)) return;
    if (from) await updateMeetingRecord(cityId, from, { postponedFromId: null }, { tx });
    if (to) {
        await tx.$queryRaw`SELECT id FROM "CouncilMeeting" WHERE "cityId" = ${cityId} AND id = ${to} FOR UPDATE`;
        await updateMeetingRecord(cityId, to, { postponedFromId: postponedId }, { tx });
    }
}

type Outcome = 'applied' | 'already-applied' | 'changed-since-report' | 'refused' | 'not-found' | 'would-apply';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('csv', { type: 'string', describe: 'The reviewed report' })
        .option('rollback', { type: 'string', describe: 'An audit file of this script: restore what it applied' })
        .check((args) => (Boolean(args.csv) !== Boolean(args.rollback) ? true : 'Pass either --csv or --rollback'))
        .option('apply', { type: 'boolean', default: false, describe: 'Write the changes (default: dry run)' })
        .option('audit', { type: 'string', describe: 'Where to append the audit lines' })
        .option('resync-calendar', { type: 'boolean', default: false, describe: 'Also sync the calendar of already-applied rows whose status or title the report changes' })
        .option('i-know-this-is-production', { type: 'boolean', default: false })
        .strict()
        .parse();
    assertNotProduction(argv['i-know-this-is-production']);
    if (argv.rollback) return rollback(argv.rollback, { apply: argv.apply, audit: argv.audit });

    const rows = (await parseCsvFile(argv.csv!)) as ReportRow[];
    const accepted = rows.filter((row) => row.apply?.toLowerCase() === 'yes');
    const auditFile = argv.audit ?? path.join(path.dirname(argv.csv!), `meeting-lifecycle-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    const counts: Record<Outcome, number> = { applied: 0, 'already-applied': 0, 'changed-since-report': 0, refused: 0, 'not-found': 0, 'would-apply': 0 };
    console.log(`${accepted.length} of ${rows.length} rows accepted; ${argv.apply ? 'applying' : 'dry run'}.`);
    const problems = accepted.map((row) => [row, rowProblem(row)] as const).filter(([, problem]) => problem !== null);
    if (problems.length > 0) {
        for (const [row, problem] of problems) console.error(`${row.cityId}/${row.id}: ${problem}`);
        throw new Error(`${problems.length} accepted rows cannot be applied; fix the CSV and run again. Nothing was written.`);
    }

    for (const row of accepted) {
        const wanted = target(row);
        let outcome: Outcome;
        let before: RowState | null = null;
        try {
            outcome = await prisma.$transaction(async (tx) => {
                // Lock the row, so an admin edit cannot slip between the check and the write.
                const locked = await lockState(tx, row.cityId, row.id);
                if (!locked) return 'not-found';
                const current = locked.state;
                before = current;
                const changes = differs(current, wanted);
                if (changes.length === 0) return 'already-applied';
                if (differs(current, reviewed(row)).length > 0) return 'changed-since-report';
                // The rules hide a postponed meeting once its new meeting is public.
                const newMeeting = wanted.postponedTo && wanted.postponedTo !== current.postponedTo
                    ? await tx.councilMeeting.findUnique({ where: { cityId_id: { cityId: row.cityId, id: wanted.postponedTo } }, select: { released: true } })
                    : null;
                const hides = locked.released && newMeeting?.released ? ' (its new meeting is public, so it is unreleased)' : '';
                console.log(`${row.cityId}/${row.id}: ${changes.map((field) => `${field} ${JSON.stringify(current[field])} → ${JSON.stringify(wanted[field])}`).join('; ')}${hides}`);
                if (!argv.apply) return 'would-apply';
                // The status first: a new meeting can only follow a postponed one.
                await updateMeetingRecord(row.cityId, row.id, fieldsOf(wanted), { tx });
                await relink(tx, row.cityId, row.id, current.postponedTo, wanted.postponedTo);
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
            if (before && titleChanges(before, wanted)) await syncMeetingToCalendar(row.cityId, row.id);
        } else if (outcome === 'already-applied' && argv.apply) {
            // The report read the row before this or an earlier run applied it,
            // so its reviewed values are what a rollback restores.
            fs.appendFileSync(auditFile, JSON.stringify({ cityId: row.cityId, id: row.id, result: 'already-applied', before: reviewed(row), after: wanted, at: new Date().toISOString() }) + '\n');
            if (argv['resync-calendar'] && titleChanges(reviewed(row), wanted)) await syncMeetingToCalendar(row.cityId, row.id);
        } else if (outcome !== 'would-apply' && outcome !== 'already-applied') {
            console.log(`${row.cityId}/${row.id}: ${outcome}`);
        }
    }

    console.log(Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(', ') || 'nothing to do');
    if (counts.applied > 0) console.log(`Audit: ${auditFile}`);
}

interface AppliedLine { cityId: string; id: string; result: string; before: RowState; after: RowState }

type RollbackOutcome = 'restored' | 'already-restored' | 'changed-since-apply' | 'refused' | 'not-found' | 'would-restore';

async function rollback(file: string, { apply, audit }: { apply: boolean; audit?: string }) {
    const applied = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
        .map((line) => JSON.parse(line) as AppliedLine)
        .filter((line) => (line.result === 'applied' || line.result === 'already-applied') && line.before && differs(line.before, line.after).length > 0)
        .reverse();
    const auditFile = audit ?? file.replace(/\.jsonl$/, '') + `-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    const counts: Record<RollbackOutcome, number> = { restored: 0, 'already-restored': 0, 'changed-since-apply': 0, refused: 0, 'not-found': 0, 'would-restore': 0 };
    console.log(`${applied.length} applied rows in ${file}; ${apply ? 'restoring' : 'dry run'}.`);

    for (const line of applied) {
        let outcome: RollbackOutcome;
        try {
            outcome = await prisma.$transaction(async (tx) => {
                const locked = await lockState(tx, line.cityId, line.id);
                if (!locked) return 'not-found';
                const current = locked.state;
                if (differs(current, line.before).length === 0) return 'already-restored';
                const changed = differs(current, line.after);
                if (changed.length > 0) {
                    console.log(`${line.cityId}/${line.id}: changed since the apply (${changed.join(', ')}); left as it is`);
                    return 'changed-since-apply';
                }
                const back = differs(line.after, line.before);
                console.log(`${line.cityId}/${line.id}: ${back.map((field) => `${field} ${JSON.stringify(line.after[field])} → ${JSON.stringify(line.before[field])}`).join('; ')}`);
                if (!apply) return 'would-restore';
                // The link first: the status of a postponed meeting cannot change while its new meeting exists.
                await relink(tx, line.cityId, line.id, line.after.postponedTo ?? null, line.before.postponedTo ?? null);
                await updateMeetingRecord(line.cityId, line.id, fieldsOf(line.before), { tx });
                return 'restored';
            });
        } catch (error) {
            if (!(error instanceof LifecycleRuleError)) throw error;
            console.error(`${line.cityId}/${line.id}: refused (${error.code}): ${error.message}`);
            outcome = 'refused';
        }
        counts[outcome]++;
        if (outcome === 'restored') {
            fs.appendFileSync(auditFile, JSON.stringify({ cityId: line.cityId, id: line.id, result: 'restored', from: line.after, to: line.before, at: new Date().toISOString() }) + '\n');
            if (titleChanges(line.after, line.before)) await syncMeetingToCalendar(line.cityId, line.id);
        }
    }

    console.log(Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(', ') || 'nothing to do');
    if (counts.restored > 0) console.log(`Audit: ${auditFile}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
