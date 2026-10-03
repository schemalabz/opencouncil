/**
 * The decision-facts tools. Every command calls the production functions; none
 * re-implements a step.
 *
 *   npm run decisions -- reread-count [--report f.txt]
 *
 * Output goes to the files named: the nix shell prints its banner to stdout.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { readingStatesFacts } from '@/lib/derivation';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from '@/lib/db/decisions';
import { getPollableMeetingDateRange, NOT_LOGODOSIA_MEETING_WHERE } from '@/lib/tasks/pollDecisionsBackoff';
import { summarizeReread, type RereadMeeting } from './lib/rereadCount';

function write(file: string, text: string) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
}

/**
 * Whether `Decision.extraction` and `extractorVersion` exist on this database.
 * Both columns land in the same migration (20260917000000_decision_facts),
 * so checking one confirms the other. A database that has not run it yet
 * (production, until #790 deploys) has no usable reading on any row: every
 * linked page counts as one the next poll will read again.
 */
async function hasExtractionColumn(): Promise<boolean> {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Decision' AND column_name = 'extraction'
    `;
    return columns.length > 0;
}

/**
 * Read-only: the pages the first cron poll after deploy reads again — linked
 * pages without a usable reading, in meetings the poll still dispatches to.
 * Mirrors pollDecisionsForRecentMeetings's selection; the poll itself decides
 * per meeting whether backoff defers it further, so this is an upper bound on
 * what the very next run reads.
 *
 * Never selects `extraction` on a database where the column does not exist
 * yet: Prisma would fail the query outright. There, a linked page is counted
 * as stale on its presence alone, since no reading on that database can be a
 * v4+ one.
 */
async function rereadCount(report?: string) {
    const columnsPresent = await hasExtractionColumn();
    const where = {
        dateTime: getPollableMeetingDateRange(),
        city: { diavgeiaUid: { not: null } },
        AND: [NOT_LOGODOSIA_MEETING_WHERE],
        subjects: { some: { ...DECISION_ELIGIBLE_SUBJECT_WHERE, decision: null } },
    };
    let meetings: RereadMeeting[];
    if (columnsPresent) {
        const rows = await prisma.councilMeeting.findMany({
            where,
            select: { cityId: true, id: true, subjects: { select: { decision: { select: { extraction: true, extractorVersion: true } } } } },
        });
        meetings = rows.map(m => ({ cityId: m.cityId, id: m.id, subjects: m.subjects.map(s => ({ stale: !!s.decision && !readingStatesFacts(s.decision) })) }));
    } else {
        const rows = await prisma.councilMeeting.findMany({
            where,
            select: { cityId: true, id: true, subjects: { select: { decision: { select: { id: true } } } } },
        });
        meetings = rows.map(m => ({ cityId: m.cityId, id: m.id, subjects: m.subjects.map(s => ({ stale: !!s.decision })) }));
    }
    const summary = summarizeReread(meetings);
    const caveat = columnsPresent ? '' : ' (Decision.extraction column not found — every linked page counts, since none can carry a usable reading yet)';
    const byCity = Object.entries(summary.byCity).sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => `  ${c}: ${n}`);
    const text = [`${summary.meetings} meetings in the poll window, ${summary.pages} pages to read again${caveat}`, ...byCity, ...summary.lines].join('\n') + '\n';
    if (report) write(report, text); else process.stderr.write(text);
}

yargs(hideBin(process.argv))
    .command('reread-count', 'the linked pages the first cron poll after deploy reads again', y => y
        .option('report', { type: 'string' }),
        a => rereadCount(a.report).then(() => prisma.$disconnect()))
    .demandCommand(1)
    .strict()
    .parse();
