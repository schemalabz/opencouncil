/**
 * One entry point for the decision-facts tools. Every command calls the
 * production functions; none re-implements a step (spec §7.0).
 *
 *   npm run decisions -- measure [--city c] [--out f.json] [--report f.md]
 *   npm run decisions -- diff <before.json> <after.json> [--report f.md]
 *   npm run decisions -- derive <city> <meeting> [--write]
 *
 * Output goes to the files named: the nix shell prints its banner to stdout.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { applyDerivation, deriveMeetingFacts, loadDerivationInput } from '@/lib/derivation';
import { derivationSkipIssue } from '@/lib/derivation/persist';
import { measureMeeting, type MeetingMeasure } from '@/lib/derivation/measure';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import { assertLocalDatabase } from './lib/local-database';

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

async function derive(city: string, meeting: string, doWrite: boolean) {
    const input = await loadDerivationInput(city, meeting);
    const skip = derivationSkipIssue(input);
    if (skip) { process.stderr.write(`${city}/${meeting}: refused, ${skip.code}: ${issueMessageEn(skip)}\n`); return; }
    const out = deriveMeetingFacts(input);
    if (doWrite) { await assertLocalDatabase(prisma, ['opencouncil', 'c1sample']); await applyDerivation(input, out); }
    const m = measureMeeting(`${city}/${meeting}`, input, out, null);
    process.stderr.write(`${city}/${meeting}: ${out.attendance.length} attendance rows, ${out.votes.length} vote rows, ${out.issues.length} issues, hash ${m.hash}${doWrite ? '' : ' (dry)'}\n`);
    for (const i of out.issues) process.stderr.write(`  ${i.code.padEnd(28)} ${i.subjectId ?? '-'} ${i.personId ?? ''} ${issueMessageEn(i)}\n`);
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
    .demandCommand(1)
    .strict()
    .parse();
