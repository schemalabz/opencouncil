/**
 * The decision-facts tools. Every command calls the production functions; none
 * re-implements a step.
 *
 *   npm run decisions -- reread-count [--report f.txt]
 *   npm run decisions -- compare-sources [--city X] [--report f.txt]
 *
 * Output goes to the files named: the nix shell prints its banner to stdout.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { readingStatesFacts } from '@/lib/derivation';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from '@/lib/db/decisions';
import { getPollableMeetingDateRange, TAKES_DECISIONS_WHERE } from '@/lib/tasks/pollDecisionsBackoff';
import { summarizeReread, type RereadMeeting } from './lib/rereadCount';
import { loadDerivationInput } from '@/lib/derivation/load';
import { compareSources, pct, sumAgreement, type Disagreement, type SourceAgreement } from './lib/compareSources';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';

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
        ...TAKES_DECISIONS_WHERE,
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

/**
 * Read-only: how often the sheet and the transcript agree with the decision
 * documents, per body, over the meetings that hold both a usable page reading
 * and a reading of the other source (issue #807). Each disagreement is listed
 * with the recording at the moment it was read, the sheet line, or the document.
 */
async function compareSourcesReport(cityId: string | undefined, report?: string) {
    const meetings = await prisma.meetingFactSource.findMany({
        where: { ...(cityId ? { cityId } : {}), reading: { not: Prisma.DbNull } },
        select: { cityId: true, councilMeetingId: true, councilMeeting: { select: { administrativeBody: { select: { name: true } }, city: { select: { realm: true } } } } },
        distinct: ['cityId', 'councilMeetingId'],
    });
    const byBody = new Map<string, SourceAgreement[]>();
    const lines: string[] = [];
    const utteranceIds = new Set<string>();
    const listed: Array<{ meeting: typeof meetings[number]; d: Disagreement }> = [];
    for (const m of meetings) {
        const input = await loadDerivationInput(m.cityId, m.councilMeetingId);
        const rows = compareSources(input);
        if (rows.length === 0) continue;
        const body = `${m.cityId} / ${m.councilMeeting.administrativeBody?.name ?? '—'}`;
        byBody.set(body, [...(byBody.get(body) ?? []), ...rows]);
        for (const r of rows) for (const d of r.disagreements) { listed.push({ meeting: m, d }); if (d.evidence?.utteranceId) utteranceIds.add(d.evidence.utteranceId); }
    }
    const timestamps = new Map((await prisma.utterance.findMany({ where: { id: { in: [...utteranceIds] } }, select: { id: true, startTimestamp: true } })).map(u => [u.id, u.startTimestamp]));
    const adas = new Map((await prisma.decision.findMany({ where: { id: { in: listed.map(l => l.d.decisionId).filter((id): id is string => !!id) } }, select: { id: true, ada: true } })).map(d => [d.id, d.ada]));
    for (const [body, rows] of [...byBody].sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(body);
        for (const t of sumAgreement(rows).values()) {
            lines.push(`  ${t.source}: roll call ${pct(t.rollCall.agreed, t.rollCall.compared)}, outcomes ${pct(t.outcomes.agreed, t.outcomes.compared)}, named votes ${pct(t.votes.agreed, t.votes.compared)}`);
        }
    }
    lines.push('', `${listed.length} disagreements`);
    for (const { meeting: m, d } of listed) {
        const base = realmBaseUrl(m.councilMeeting.city.realm);
        const t = d.evidence?.utteranceId ? timestamps.get(d.evidence.utteranceId) : undefined;
        const where = t !== undefined ? `${base}/${m.cityId}/${m.councilMeetingId}?t=${Math.floor(t)}`
            : d.evidence?.line !== undefined ? `sheet line ${d.evidence.line}` : '';
        const ada = d.decisionId ? adas.get(d.decisionId) : null;
        lines.push(`  ${m.cityId}/${m.councilMeetingId} ${d.source} ${d.fact}${d.subjectId ? ` ${d.subjectId}` : ''}${d.personId ? ` ${d.personId}` : ''}: page ${d.page}, ${d.source} ${d.stated}${where ? ` — ${where}` : ''}${ada ? ` — https://diavgeia.gov.gr/decision/view/${ada}` : ''}`);
    }
    const text = lines.join('\n') + '\n';
    if (report) write(report, text); else process.stderr.write(text);
}

yargs(hideBin(process.argv))
    .command('reread-count', 'the linked pages the first cron poll after deploy reads again', y => y
        .option('report', { type: 'string' }),
        a => rereadCount(a.report).then(() => prisma.$disconnect()))
    .command('compare-sources', 'how often the sheet and the transcript agree with the documents, per body', y => y
        .option('city', { type: 'string' })
        .option('report', { type: 'string' }),
        a => compareSourcesReport(a.city, a.report).then(() => prisma.$disconnect()))
    .demandCommand(1)
    .strict()
    .parse();
