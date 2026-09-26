/**
 * One entry point for the decision-facts tools. Every command calls the
 * production functions; none re-implements a step (spec §7.0).
 *
 *   npm run decisions -- measure [--city c] [--out f.json] [--report f.md]
 *   npm run decisions -- diff <before.json> <after.json> [--report f.md]
 *   npm run decisions -- derive <city> <meeting> [--write]
 *   npm run decisions -- trace <city> <meeting> [--out f.json]
 *   npm run decisions -- trace --all [--city c] --out-dir d
 *   npm run decisions -- equivalence [--report f.md]   (historical: pre-C1 rows only)
 *   npm run decisions -- check [--derive] [--report f.txt] [meetings...]
 *   npm run decisions -- reread-count [--report f.txt]
 *
 * Output goes to the files named: the nix shell prints its banner to stdout.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { applyDerivation, deriveAndPersist, deriveMeetingFacts, explainMeeting, loadDerivationInput, readingStatesFacts } from '@/lib/derivation';
import { resolveSession } from '@/lib/derivation/resolveSession';
import { derivationSkipIssue } from '@/lib/derivation/persist';
import { measureMeeting, type MeetingMeasure } from '@/lib/derivation/measure';
import { issuePerson } from '@/lib/derivation/issueText';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import type { DerivationInput, DerivationOutput } from '@/lib/derivation/types';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from '@/lib/db/decisions';
import { getPollableMeetingDateRange, LOGODOSIA_NAME_PATTERN } from '@/lib/tasks/pollDecisionsBackoff';
import { assertLocalDatabase } from './lib/local-database';
import { buildMeetingTrace, type MeetingTraceMeta } from './lib/trace';
import { loadGolden, subjectsByClaimKey } from './lib/minutes-golden';
import { checkMeeting, type CheckLine } from './lib/minutes-check';
import { summarizeReread, type RereadMeeting } from './lib/rereadCount';

interface MeasureFile { generatedAt: string; commit: string; meetings: MeetingMeasure[] }

function write(file: string, text: string) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
}

async function meetingsWithReadings(city?: string) {
    return prisma.councilMeeting.findMany({
        where: { ...(city ? { cityId: city } : {}), subjects: { some: { decision: { extractorVersion: { not: null } } } } },
        select: { cityId: true, id: true, administrativeBody: { select: { name: true } } },
        orderBy: [{ cityId: 'asc' }, { id: 'asc' }],
    });
}

async function measure(args: { city?: string; out?: string; report?: string }) {
    const meetings = await meetingsWithReadings(args.city);
    const out: MeasureFile = { generatedAt: new Date().toISOString(), commit: execSync('git rev-parse --short HEAD').toString().trim(), meetings: [] };
    const bodyOf = new Map<string, string>();
    for (const m of meetings) {
        const key = `${m.cityId}/${m.id}`;
        bodyOf.set(key, `${m.cityId} ${m.administrativeBody?.name ?? '(no body)'}`);
        const input = await loadDerivationInput(m.cityId, m.id);
        const skip = derivationSkipIssue(input);
        out.meetings.push(measureMeeting(key, input, skip ? null : deriveMeetingFacts(input), skip?.code ?? null));
    }
    if (args.out) write(args.out, JSON.stringify(out, null, 1));
    const lines = [`# Derivation measure at ${out.commit}`, '', `${out.meetings.length} meetings`, '',
        '| meeting | body | refused | 1 mayor rows | 2 unstated absences | 3 list omits mayor | 4 dropped | 5 votes while absent | 6 convention | 7 collapsed | 9 both lists |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
    for (const m of out.meetings) {
        const c = m.checks;
        const flagged = m.refused || c.mayorRowsOffBody || c.unstatedAbsences.length || c.listOmitsMayor || c.changesDropped || c.votesWhileAbsent
            || c.conventionContradictions || c.namesCollapsed.length || c.inBothLists.length;
        if (!flagged) continue;
        const absences = c.unstatedAbsences.map(a => `${a.personId} ${a.absentOn}/${a.of}`).join(', ');
        lines.push(`| ${m.meeting} | ${bodyOf.get(m.meeting)} | ${m.refused ?? ''} | ${c.mayorRowsOffBody || ''} | ${absences} | ${c.listOmitsMayor || ''} | ${c.changesDropped || ''} | ${c.votesWhileAbsent || ''} | ${c.conventionContradictions || ''} | ${c.namesCollapsed.length || ''} | ${c.inBothLists.length || ''} |`);
    }
    if (args.report) write(args.report, lines.join('\n') + '\n');
}

function diff(a: string, b: string, report?: string) {
    const before = JSON.parse(readFileSync(a, 'utf8')) as MeasureFile;
    const after = JSON.parse(readFileSync(b, 'utf8')) as MeasureFile;
    const byKey = new Map(before.meetings.map(m => [m.meeting, m]));
    const lines = [`# ${before.commit} → ${after.commit}`, '', '| meeting | change |', '| --- | --- |'];
    for (const m of after.meetings) {
        const o = byKey.get(m.meeting);
        if (!o) { lines.push(`| ${m.meeting} | new |`); continue; }
        const changes: string[] = [];
        if (o.refused !== m.refused) changes.push(`refused ${o.refused ?? '-'} → ${m.refused ?? '-'}`);
        if (o.hash !== m.hash) changes.push(`rows ${o.attendanceRows}+${o.voteRows} → ${m.attendanceRows}+${m.voteRows}`);
        for (const code of new Set([...Object.keys(o.issues), ...Object.keys(m.issues)])) {
            if ((o.issues[code] ?? 0) !== (m.issues[code] ?? 0)) changes.push(`${code} ${o.issues[code] ?? 0} → ${m.issues[code] ?? 0}`);
        }
        if (changes.length) lines.push(`| ${m.meeting} | ${changes.join('; ')} |`);
    }
    const text = lines.join('\n') + '\n';
    if (report) write(report, text); else process.stderr.write(text);
}

/**
 * On meetings whose stored roll call and events came from one task run that read
 * every page, the resolver over the stored pages must give the same rows (spec
 * §2.2).
 *
 * Historical: meaningful only on rows that the pre-C1 poll handler wrote. The
 * derivation now writes the `decision` rows with the poll's taskId, so on a
 * meeting polled after C1 this compares the resolver with itself. The C1 gate
 * result, measured on c1sample at 31b80b171: 21 meetings, events 73/73, roll
 * call 327/327.
 */
async function equivalence(report?: string) {
    const meetings = await meetingsWithReadings();
    let rcSame = 0, rcTotal = 0, rcMayorOnly = 0, evSame = 0, evTotal = 0, compared = 0;
    const lines: string[] = [];
    for (const m of meetings) {
        // Only a meeting that one poll read in full compares: the task resolved over that poll's pages.
        // Decision.taskId is not set when a poll re-reads a linked page, so the polls are counted instead.
        const polls = await prisma.taskStatus.findMany({ where: { cityId: m.cityId, councilMeetingId: m.id, type: 'pollDecisions', status: 'succeeded' }, select: { id: true } });
        const stored = await prisma.meetingAttendance.findMany({ where: { cityId: m.cityId, councilMeetingId: m.id, source: 'decision' } });
        if (polls.length !== 1 || stored.length === 0 || stored.some(r => r.taskId !== polls[0].id)) continue;
        compared += 1;
        const input = await loadDerivationInput(m.cityId, m.id);
        // The task applied no convention, so compare the rule it ran.
        const session = resolveSession({ ...input, conventions: null });
        const mine = new Map(session.rollCall.map(r => [r.personId, r.status]));
        for (const r of stored) {
            rcTotal += 1;
            if (mine.get(r.personId) === r.status) rcSame += 1;
            else if (r.personId === input.cityMayorPersonId && !mine.has(r.personId)) rcMayorOnly += 1;
            else lines.push(`${m.cityId}/${m.id} roll call ${r.personId}: stored ${r.status}, resolved ${mine.get(r.personId) ?? '-'}`);
        }
        const key = (e: { personId: string; kind: string; anchorKind: string; anchorAgendaItemIndex: number | null; anchorDecisionNumber: string | null; anchorPhase: string | null; anchorSubjectId: string | null }) =>
            [e.personId, e.kind, e.anchorKind, e.anchorAgendaItemIndex, e.anchorDecisionNumber, e.anchorPhase, e.anchorSubjectId].join('|');
        const storedEvents = await prisma.attendanceEvent.findMany({ where: { cityId: m.cityId, councilMeetingId: m.id, source: 'decision' } });
        const resolved = new Set(session.events.map(key));
        const storedKeys = new Set(storedEvents.map(key));
        for (const k of storedKeys) { evTotal += 1; if (resolved.has(k)) evSame += 1; else lines.push(`${m.cityId}/${m.id} event stored only: ${k}`); }
        for (const k of resolved) if (!storedKeys.has(k)) lines.push(`${m.cityId}/${m.id} event resolved only: ${k}`);
    }
    const headline = 'Historical check: meaningful only on rows that the pre-C1 poll handler wrote. On a meeting polled after C1 it compares the resolver with itself. C1 gate (c1sample at 31b80b171): 21 meetings, events 73/73, roll call 327/327.';
    const summary = `${compared} meetings: events ${evSame}/${evTotal}, roll call ${rcSame}/${rcTotal} (+${rcMayorOnly} mayor rows)`;
    const text = [headline, summary, ...lines].join('\n') + '\n';
    if (report) write(report, text); else process.stderr.write(text);
}

/**
 * The minutes checker: fixtures/minutes-golden.json against what each meeting
 * renders from. `--derive` re-derives each meeting first, since the check reads
 * the rows a meeting last derived to — after a rule or a convention changes,
 * those rows are stale and the numbers describe the old rule.
 */
async function check(meetings: string[], derive: boolean, report?: string) {
    const golden = loadGolden().meetings.filter(m => !meetings.length || meetings.includes(`${m.cityId}/${m.meetingId}`));
    const all: CheckLine[] = [];
    for (const m of golden) {
        if (derive) { await assertLocalDatabase(prisma, ['opencouncil', 'c1sample']); await deriveAndPersist(m.cityId, m.meetingId); }
        const data = await getMinutesData(m.cityId, m.meetingId);
        all.push(...checkMeeting(m, data));
        // What the derivation flagged for this meeting, printed beside the claims (not counted).
        const key = `${m.cityId}/${m.meetingId}`;
        const { keyBySubjectId } = subjectsByClaimKey(data);
        const explained = await explainMeeting(m.cityId, m.meetingId);
        const nameOf = await personNameLookup(m.cityId);
        for (const i of explained.issues) {
            const where = i.subjectId ? (keyBySubjectId.get(i.subjectId) ?? i.subjectId) : '-';
            all.push({ kind: 'issue', meeting: key, claim: `issue ${i.code}`, detail: `${where} ${issuePerson(i, nameOf)?.name ?? ''} ${issueMessageEn(i)}`.replace(/\s+/g, ' ').trim() });
        }
    }
    const claims = all.filter(l => l.kind === 'claim');
    const count = (o: string) => claims.filter(l => l.outcome === o).length;
    const unexpected = claims.filter(l => l.outcome !== l.expect);
    const text = [...all.map(l => `${l.meeting} ${l.kind === 'claim' ? l.outcome : 'issue'} ${l.claim} ${l.detail}`),
        `${golden.length} meetings, ${claims.length} claims: ${count('agree')} agree, ${count('disagree')} disagree, ${count('missing')} missing; ${unexpected.length} unexpected`].join('\n') + '\n';
    if (report) write(report, text); else process.stderr.write(text);
    if (unexpected.length) process.exitCode = 1;
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
 * pages without a usable reading, in meetings the poll still dispatches to
 * (spec §5.1). Mirrors pollDecisionsForRecentMeetings's selection; the poll
 * itself decides per meeting whether backoff defers it further, so this is an
 * upper bound on what the very next run reads.
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
        NOT: { name: { contains: LOGODOSIA_NAME_PATTERN } },
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

async function derive(city: string, meeting: string, doWrite: boolean) {
    const input = await loadDerivationInput(city, meeting);
    const skip = derivationSkipIssue(input);
    if (skip) { process.stderr.write(`${city}/${meeting}: refused, ${skip.code}: ${issueMessageEn(skip)}\n`); return; }
    const out = deriveMeetingFacts(input);
    if (doWrite) { await assertLocalDatabase(prisma, ['opencouncil', 'c1sample']); await applyDerivation(input, out); }
    const m = measureMeeting(`${city}/${meeting}`, input, out, null);
    process.stderr.write(`${city}/${meeting}: ${out.attendance.length} attendance rows, ${out.votes.length} vote rows, ${out.issues.length} issues, hash ${m.hash}${doWrite ? '' : ' (dry)'}\n`);
    const nameOf = await personNameLookup(city);
    for (const i of out.issues) process.stderr.write(`  ${i.code.padEnd(28)} ${i.subjectId ?? '-'} ${issuePerson(i, nameOf)?.name ?? ''} ${issueMessageEn(i)}\n`);
}

/** Every person of the city by id, in one query, for the issues that name one. An id the city lacks prints as itself. */
async function personNames(cityId: string): Promise<Record<string, string>> {
    const people = await prisma.person.findMany({ where: { cityId }, select: { id: true, name: true } });
    return Object.fromEntries(people.map(p => [p.id, p.name]));
}

async function personNameLookup(cityId: string): Promise<(personId: string) => string> {
    const names = await personNames(cityId);
    return id => names[id] ?? id;
}

/** Display data buildMeetingTrace needs but the derivation never reads: names, ada, urls, the commit. */
async function traceMeta(cityId: string, meetingId: string, input: DerivationInput, commit: string): Promise<MeetingTraceMeta> {
    const meeting = await prisma.councilMeeting.findUniqueOrThrow({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { name: true, dateTime: true, administrativeBody: { select: { name: true, type: true } } },
    });
    const decisions = await prisma.decision.findMany({
        where: { subjectId: { in: input.documents.map(d => d.subjectId) } },
        select: { subjectId: true, ada: true, pdfUrl: true, extractorVersion: true },
    });
    return {
        commit,
        meeting: {
            name: meeting.name, date: meeting.dateTime.toISOString(),
            body: meeting.administrativeBody ? { name: meeting.administrativeBody.name, type: meeting.administrativeBody.type } : null,
        },
        decisions: Object.fromEntries(decisions.map(d => [d.subjectId, { ada: d.ada, url: d.pdfUrl, version: d.extractorVersion }])),
        personNames: await personNames(cityId),
    };
}

/** loadDerivationInput + derivationSkipIssue + deriveMeetingFacts, in explainMeeting's order — but keeping `input`, which buildMeetingTrace also needs. */
async function traceInputAndOutput(cityId: string, meetingId: string): Promise<{ input: DerivationInput; output: DerivationOutput }> {
    const input = await loadDerivationInput(cityId, meetingId);
    const skip = derivationSkipIssue(input);
    const output: DerivationOutput = skip
        ? { attendance: [], votes: [], phraseOnlySubjectIds: [], rollCall: [], events: [], issues: [skip] }
        : deriveMeetingFacts(input);
    return { input, output };
}

async function trace(city: string, meeting: string, out?: string) {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const { input, output } = await traceInputAndOutput(city, meeting);
    const meta = await traceMeta(city, meeting, input, commit);
    const text = JSON.stringify(buildMeetingTrace(input, output, meta), null, 1);
    if (out) write(out, text); else process.stderr.write(text + '\n');
}

async function traceAll(args: { city?: string; outDir: string }) {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const meetings = await meetingsWithReadings(args.city);
    let count = 0;
    for (const m of meetings) {
        const { input, output } = await traceInputAndOutput(m.cityId, m.id);
        const meta = await traceMeta(m.cityId, m.id, input, commit);
        write(`${args.outDir}/${m.cityId}__${m.id}.json`, JSON.stringify(buildMeetingTrace(input, output, meta), null, 1));
        count += 1;
    }
    process.stderr.write(`wrote ${count} trace files to ${args.outDir}\n`);
}

yargs(hideBin(process.argv))
    .command('measure', 'measure every meeting with readings', y => y
        .option('city', { type: 'string' }).option('out', { type: 'string' }).option('report', { type: 'string' }),
        a => measure(a).then(() => prisma.$disconnect()))
    .command('diff <before> <after>', 'compare two measure files', y => y
        .positional('before', { type: 'string', demandOption: true }).positional('after', { type: 'string', demandOption: true })
        .option('report', { type: 'string' }),
        a => diff(a.before, a.after, a.report))
    .command('derive <city> <meeting>', 'derive one meeting; dry unless --write', y => y
        .positional('city', { type: 'string', demandOption: true }).positional('meeting', { type: 'string', demandOption: true })
        .option('write', { type: 'boolean', default: false }),
        a => derive(a.city, a.meeting, a.write).then(() => prisma.$disconnect()))
    .command('trace [city] [meeting]', 'trace one meeting from pages to rows, or every meeting with readings under --all', y => y
        .positional('city', { type: 'string' }).positional('meeting', { type: 'string' })
        .option('all', { type: 'boolean', default: false })
        .option('out', { type: 'string' })
        .option('outDir', { type: 'string' })
        .check(a => {
            if (a.all) { if (!a.outDir) throw new Error('trace --all needs --out-dir'); return true; }
            if (!a.city || !a.meeting) throw new Error('trace needs <city> <meeting>, or --all --out-dir <dir>');
            return true;
        }),
        a => (a.all ? traceAll({ city: a.city, outDir: a.outDir! }) : trace(a.city!, a.meeting!, a.out)).then(() => prisma.$disconnect()))
    .command('equivalence', 'historical: the resolver against the rows the pre-C1 poll handler stored', y => y.option('report', { type: 'string' }),
        a => equivalence(a.report).then(() => prisma.$disconnect()))
    .command('check [meetings..]', 'the minutes against fixtures/minutes-golden.json', y => y
        .positional('meetings', { type: 'string', array: true, default: [] })
        .option('derive', { type: 'boolean', default: false })
        .option('report', { type: 'string' }),
        a => check(a.meetings as string[], a.derive, a.report).then(() => prisma.$disconnect()))
    .command('reread-count', 'the linked pages the first cron poll after deploy reads again', y => y
        .option('report', { type: 'string' }),
        a => rereadCount(a.report).then(() => prisma.$disconnect()))
    .demandCommand(1)
    .strict()
    .parse();
