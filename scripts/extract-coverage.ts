/**
 * Pick the fewest meetings whose extraction exercises every mechanism an
 * administrative body's documents are known to contain.
 *
 * Proving extraction works for a body is not proving it on one meeting: a
 * meeting may state no arrival, no departure, no unusual vote. The survey in
 * `.extraction-survey/observations-v5.json` records, per sampled document, what
 * that document exercises. Joined to `Decision.ada` this says which of a body's
 * meetings would exercise what, and which mechanisms the body's corpus never
 * shows at all — a finding about the body, not a gap to hide.
 *
 * Selection is greedy on **mechanisms per document**, not per meeting. Cost
 * scales with documents, so a 66-document meeting that adds one mechanism is a
 * bad buy.
 *
 * Usage:
 *   npx tsx scripts/extract-coverage.ts                       # dry report, all supported cities
 *   npx tsx scripts/extract-coverage.ts --city sparta
 *   npx tsx scripts/extract-coverage.ts --body 'Δημοτική Επιτροπή'
 *   npx tsx scripts/extract-coverage.ts --max-meetings 3 --budget 30
 *   npx tsx scripts/extract-coverage.ts --anchors             # count each attendance anchor separately
 *   npx tsx scripts/extract-coverage.ts --poll                # actually extract
 *
 * `--claims` asks a different question of the same vocabulary: not which
 * mechanisms have been extracted, but which the meeting checker would notice
 * breaking. The document scorer measures the reader and never runs the
 * derivation; `check-minutes.ts` runs the derivation, over the meetings in
 * `fixtures/minutes-golden.json` only, and tests only what a claim names. A
 * mechanism no claim sits on can break in the derivation with both instruments
 * green.
 *
 *   npx tsx scripts/extract-coverage.ts --claims              # every body with a stored reading
 *   npx tsx scripts/extract-coverage.ts --claims --city athens
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { pollDecisionsForMeeting } from '@/lib/tasks/pollDecisions';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { loadGolden, subjectsByClaimKey, type Claim, type GoldenMeeting } from './lib/minutes-golden';

const prisma = new PrismaClient();

/** From a Langfuse trace of an 8-document poll costing $1.25. */
const COST_PER_DOCUMENT = 0.157;
const EXTRACTOR_VERSION = '4';
const DEFAULT_OBSERVATIONS = '.extraction-survey/observations-v5.json';

type Observation = Record<string, unknown>;
type SurveyFile = { bodies: Array<{ observations?: Array<{ ada: string; pages: number; observation: Observation }> }> };

type Reading = Record<string, unknown>;
/** The kind of claim whose check would fail if the derivation mishandled the mechanism. */
type ClaimKind = 'vote' | 'presence' | 'changes' | 'rollCall' | 'withdrawn' | 'subject';

const list = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
const votesOf = (r: Reading) => list(r.voteDetails).map(v => String(v.vote));
const DISSENT = ['AGAINST', 'ABSTAIN', 'PRESENT', 'DID_NOT_VOTE'];
const counted = (r: Reading, type: string) => Number((r.voteTally as Record<string, unknown> | null)?.[type] ?? 0);
/** One per person, as the derivation counts them: a dissenter named twice attributes one vote. */
const namedOf = (r: Reading, type: string) => new Set(list(r.voteDetails).filter(v => v.vote === type).map(v => String(v.personId ?? v.name))).size;
const ownSubject = (c: Record<string, unknown>) => ['subject', 'this_document'].includes(String((c.anchor as Record<string, unknown> | null)?.kind));
const timing = (c: Record<string, unknown>) => (c.anchor as Record<string, unknown> | null)?.timing;

/**
 * A mechanism is one thing a document can state that extraction has to handle.
 * Names are the vocabulary of the report. `of` reads it from a survey
 * observation; `inReading` from a stored v4 reading, which is all the
 * derivation ever sees and exists for documents the survey never sampled. The
 * last three have no survey field: they are branches of the derivation itself.
 */
const MECHANISMS: Array<{ name: string; testedBy: ClaimKind; of?: (o: Observation) => boolean; inReading?: (r: Reading) => boolean }> = [
    { name: 'arrivalOrDeparture', testedBy: 'changes', of: o => o.attendanceChangesStated === true, inReading: r => list(r.attendanceChanges).length > 0 },
    { name: 'perVoteAbsence', testedBy: 'presence', of: o => o.perVoteAbsenceStated === true,
        inReading: r => list(r.attendanceChanges).some(c => ownSubject(c) && c.type === 'departure' && timing(c) === 'before') },
    { name: 'namesAllVoters', testedBy: 'vote', of: o => o.namedVoters === 'all', inReading: r => votesOf(r).includes('FOR') },
    { name: 'namesDissenters', testedBy: 'vote', of: o => o.namedVoters === 'dissenters_only', inReading: r => votesOf(r).length > 0 && !votesOf(r).includes('FOR') },
    { name: 'voteCountsInPhrase', testedBy: 'vote', of: o => o.votePhraseCarriesCounts === true, inReading: r => ['FOR', ...DISSENT].some(t => counted(r, t) > 0) },
    { name: 'declarations', testedBy: 'vote', of: o => o.declarationsRecorded === true, inReading: r => votesOf(r).some(v => v === 'PRESENT' || v === 'DID_NOT_VOTE') },
    { name: 'partialOrPerLineVote', testedBy: 'vote', of: o => o.partialOrPerLineVote === true },
    { name: 'substitutes', testedBy: 'rollCall', of: o => o.substitutesPresent === true },
    { name: 'replacedMemberListed', testedBy: 'rollCall', of: o => o.replacedMemberAlsoListed === true },
    { name: 'outOfAgenda', testedBy: 'subject', of: o => o.isOutOfAgenda === true, inReading: r => (r.subjectInfo as Record<string, unknown> | null)?.isOutOfAgenda === true },
    { name: 'discussionOrder', testedBy: 'changes', of: o => o.discussionOrderStated === true },
    { name: 'withdrawnItems', testedBy: 'withdrawn', of: o => o.withdrawnItemsStated === true },
    { name: 'correctedRepost', testedBy: 'subject', of: o => o.correctedRepost === true },
    { name: 'embeddedOtherBodyDecision', testedBy: 'subject', of: o => o.embeddedOtherBodyDecision === true },
    { name: 'countedDissent', testedBy: 'vote', inReading: r => DISSENT.some(t => counted(r, t) > 0) },
    { name: 'unattributedDissent', testedBy: 'vote', inReading: r => DISSENT.some(t => counted(r, t) > namedOf(r, t)) },
    { name: 'statedPerDecisionList', testedBy: 'presence', inReading: r => list([r.decisionAttendance]).some(d => Array.isArray(d.presentIds) && d.presentIds.length > 0) },
];
const TESTED_BY = new Map(MECHANISMS.map(m => [m.name, m.testedBy]));

/**
 * An attendance change anchored to a decision number is a different code path
 * from one anchored to a clock time, so under --anchors each anchor a body uses
 * counts as its own mechanism. Off by default: it splits `arrivalOrDeparture`
 * into up to five, and a body rarely has meetings enough to cover them all.
 */
function mechanismsOf(o: Observation, anchors: boolean): string[] {
    const found = MECHANISMS.filter(m => m.of?.(o)).map(m => m.name);
    if (anchors && o.attendanceChangesStated === true && typeof o.attendanceChangePinnedTo === 'string') {
        found.push(`arrivalPinnedTo:${o.attendanceChangePinnedTo}`);
    }
    return found;
}

function parseArgs() {
    const argv = process.argv.slice(2);
    const get = (flag: string) => {
        const i = argv.indexOf(flag);
        return i === -1 ? undefined : argv[i + 1];
    };
    const num = (flag: string, fallback: number) => {
        const v = get(flag);
        return v === undefined ? fallback : Number(v);
    };
    return {
        city: get('--city'),
        body: get('--body'),
        maxMeetings: num('--max-meetings', 2),
        budget: num('--budget', Infinity),
        observations: get('--observations') ?? DEFAULT_OBSERVATIONS,
        anchors: argv.includes('--anchors'),
        poll: argv.includes('--poll'),
        claims: argv.includes('--claims'),
    };
}

type MeetingRow = {
    cityId: string; meetingId: string; date: Date;
    docs: number; unextracted: number; observed: number;
    adas: Array<{ ada: string | null; extracted: boolean }>;
    mechanisms: Set<string>;
};

function loadObservations(path: string, anchors: boolean): Map<string, string[]> {
    if (!fs.existsSync(path)) {
        throw new Error(`observations file not found: ${path} (pass --observations <path>)`);
    }
    const survey = JSON.parse(fs.readFileSync(path, 'utf8')) as SurveyFile;
    const byAda = new Map<string, string[]>();
    for (const body of survey.bodies) {
        for (const entry of body.observations ?? []) byAda.set(entry.ada, mechanismsOf(entry.observation, anchors));
    }
    return byAda;
}

async function collectBodies(filter: { city?: string; body?: string }) {
    const decisions = await prisma.decision.findMany({
        where: {
            subject: {
                councilMeeting: {
                    city: { status: 'supported', ...(filter.city ? { id: filter.city } : {}) },
                    ...(filter.body ? { administrativeBody: { name: filter.body } } : {}),
                },
            },
        },
        select: {
            ada: true,
            extractorVersion: true,
            subject: {
                select: {
                    cityId: true,
                    councilMeetingId: true,
                    councilMeeting: {
                        select: { dateTime: true, administrativeBody: { select: { name: true } } },
                    },
                },
            },
        },
    });

    const bodies = new Map<string, Map<string, MeetingRow>>();
    for (const d of decisions) {
        const meeting = d.subject.councilMeeting;
        const ab = meeting.administrativeBody;
        if (!ab) continue; // a meeting with no body cannot be reported per body
        const bodyKey = `${d.subject.cityId}/${ab.name}`;
        let body = bodies.get(bodyKey);
        if (!body) bodies.set(bodyKey, (body = new Map()));
        let row = body.get(d.subject.councilMeetingId);
        if (!row) {
            row = { cityId: d.subject.cityId, meetingId: d.subject.councilMeetingId, date: meeting.dateTime, docs: 0, unextracted: 0, observed: 0, adas: [], mechanisms: new Set() };
            body.set(d.subject.councilMeetingId, row);
        }
        row.docs++;
        if (d.extractorVersion !== EXTRACTOR_VERSION) row.unextracted++;
        row.adas.push({ ada: d.ada, extracted: d.extractorVersion === EXTRACTOR_VERSION });
    }
    return bodies;
}

type Selection = { cityId: string; meetingId: string; docs: number; cost: number; gain: string[] };

function selectForBody(
    meetings: MeetingRow[],
    byAda: Map<string, string[]>,
    maxMeetings: number,
    budgetLeft: number,
) {
    const exercised = new Map<string, number>();
    const covered = new Set<string>();
    for (const m of meetings) {
        for (const { ada, extracted } of m.adas) {
            const mechs = ada ? byAda.get(ada) : undefined;
            if (!mechs) continue;
            m.observed++;
            for (const mech of mechs) {
                exercised.set(mech, (exercised.get(mech) ?? 0) + 1);
                m.mechanisms.add(mech);
                if (extracted) covered.add(mech);
            }
        }
    }

    const remaining = new Set([...exercised.keys()].filter(m => !covered.has(m)));
    const pool = meetings.filter(m => m.unextracted > 0 && m.mechanisms.size > 0);
    const selected: Selection[] = [];
    let spent = 0;

    while (selected.length < maxMeetings && remaining.size > 0) {
        let best: { m: MeetingRow; gain: string[] } | undefined;
        for (const m of pool) {
            if (selected.some(s => s.meetingId === m.meetingId)) continue;
            const gain = [...m.mechanisms].filter(x => remaining.has(x));
            if (!gain.length) continue;
            if (!best) { best = { m, gain }; continue; }
            const a = gain.length / m.docs;
            const b = best.gain.length / best.m.docs;
            // Tie on density goes to the cheaper meeting: same proof, less spend.
            if (a > b || (a === b && m.docs < best.m.docs)) best = { m, gain };
        }
        if (!best) break;
        const cost = best.m.docs * COST_PER_DOCUMENT;
        if (spent + cost > budgetLeft) break;
        spent += cost;
        selected.push({ cityId: best.m.cityId, meetingId: best.m.meetingId, docs: best.m.docs, cost, gain: best.gain });
        for (const g of best.gain) remaining.delete(g);
    }

    return { exercised, covered, selected, spent, uncovered: [...remaining].sort() };
}

async function waitForTask(taskId: string): Promise<'succeeded' | 'failed'> {
    for (;;) {
        const task = await prisma.taskStatus.findUnique({ where: { id: taskId }, select: { status: true, stage: true, responseBody: true } });
        if (!task) throw new Error(`task ${taskId} vanished`);
        if (task.status === 'succeeded' || task.status === 'failed') {
            if (task.status === 'failed') console.error(`    ${task.responseBody?.slice(0, 500)}`);
            return task.status;
        }
        await new Promise(r => setTimeout(r, 10_000));
    }
}

/** Which kinds of claim a golden meeting makes about one subject key; meeting-wide kinds apply to every subject. */
function claimKindsAt(m: GoldenMeeting, key: string | undefined): Set<ClaimKind> {
    const kinds = new Set<ClaimKind>();
    if (m.rollCall) kinds.add('rollCall');
    if (m.changes?.length) kinds.add('changes');
    if (m.withdrawn?.length) kinds.add('withdrawn');
    const c: Claim | undefined = key === undefined ? undefined : m.subjects[key];
    if (!c) return kinds;
    kinds.add('subject');
    if (c.outcome || c.for || c.against || c.blank || c.declaredPresent || c.declaredAbstain) kinds.add('vote');
    if (c.present || c.absent) kinds.add('presence');
    return kinds;
}

type Tier = { documents: number; inGolden: number; claimed: number; unclaimed: string[] };

async function reportClaims(args: ReturnType<typeof parseArgs>) {
    // The survey is optional here: a stored reading alone says what the derivation was given.
    const byAda = fs.existsSync(args.observations) ? loadObservations(args.observations, args.anchors) : new Map<string, string[]>();
    const golden = new Map(loadGolden().meetings.map(m => [`${m.cityId}/${m.meetingId}`, m]));
    const keysByMeeting = new Map<string, Map<string, string>>();
    for (const [key, m] of golden) keysByMeeting.set(key, subjectsByClaimKey(await getMinutesData(m.cityId, m.meetingId)).keyBySubjectId);

    const decisions = await prisma.decision.findMany({
        where: {
            subject: { councilMeeting: { ...(args.city ? { cityId: args.city } : {}), ...(args.body ? { administrativeBody: { name: args.body } } : {}) } },
        },
        select: {
            ada: true, extraction: true, extractorVersion: true, subjectId: true,
            subject: { select: { cityId: true, councilMeetingId: true, councilMeeting: { select: { administrativeBody: { select: { name: true } } } } } },
        },
    });

    const bodies = new Map<string, Map<string, Tier>>();
    const overall = new Map<string, Tier>();
    for (const d of decisions) {
        const reading = d.extractorVersion === EXTRACTOR_VERSION && d.extraction && typeof d.extraction === 'object' ? d.extraction as Reading : null;
        const mechs = new Set([
            ...(d.ada ? byAda.get(d.ada) ?? [] : []),
            ...(reading ? MECHANISMS.filter(m => m.inReading?.(reading)).map(m => m.name) : []),
        ]);
        if (!mechs.size) continue;
        const meetingKey = `${d.subject.cityId}/${d.subject.councilMeetingId}`;
        const meeting = golden.get(meetingKey);
        const kinds = meeting ? claimKindsAt(meeting, keysByMeeting.get(meetingKey)!.get(d.subjectId)) : null;
        const bodyKey = `${d.subject.cityId}/${d.subject.councilMeeting.administrativeBody?.name ?? '(no body)'}`;
        if (!bodies.has(bodyKey)) bodies.set(bodyKey, new Map());
        for (const mech of mechs) {
            // An anchor mechanism (`arrivalPinnedTo:…`) is a refinement of arrivalOrDeparture and is tested as one.
            const claimed = kinds?.has(TESTED_BY.get(mech) ?? 'changes') ?? false;
            for (const table of [bodies.get(bodyKey)!, overall]) {
                if (!table.has(mech)) table.set(mech, { documents: 0, inGolden: 0, claimed: 0, unclaimed: [] });
                const t = table.get(mech)!;
                t.documents++;
                if (meeting) t.inGolden++;
                if (claimed) t.claimed++; else t.unclaimed.push(`${d.ada} (${meetingKey})`);
            }
        }
    }

    const print = (title: string, table: Map<string, Tier>, examples: number) => {
        console.log(`\n${title}`);
        console.log(`  ${'mechanism'.padEnd(28)} ${'documents'.padStart(9)} ${'in a golden meeting'.padStart(20)} ${'under a claim that tests it'.padStart(28)}`);
        for (const [mech, t] of [...table].sort((a, b) => a[1].claimed - b[1].claimed || b[1].documents - a[1].documents)) {
            console.log(`  ${mech.padEnd(28)} ${String(t.documents).padStart(9)} ${String(t.inGolden).padStart(20)} ${String(t.claimed).padStart(28)}${t.claimed ? '' : `   UNCLAIMED (needs a ${TESTED_BY.get(mech) ?? 'changes'} claim)`}`);
            if (!t.claimed) for (const e of t.unclaimed.slice(0, examples)) console.log(`      ${e}`);
        }
    };
    for (const key of [...bodies.keys()].sort()) print(key, bodies.get(key)!, 2);
    print('== every body ==', overall, 5);
    const bare = [...overall].filter(([, t]) => !t.claimed).map(([m]) => m);
    console.log(`\n${bare.length} of ${overall.size} mechanisms are under no claim anywhere${bare.length ? `: ${bare.sort().join(', ')}` : ''}`);
}

async function main() {
    const args = parseArgs();
    if (args.claims) return reportClaims(args);
    const byAda = loadObservations(args.observations, args.anchors);
    const bodies = await collectBodies(args);

    const plan: Selection[] = [];
    let totalDocs = 0;
    let totalCost = 0;

    for (const key of [...bodies.keys()].sort()) {
        const meetings = [...bodies.get(key)!.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
        const r = selectForBody(meetings, byAda, args.maxMeetings, args.budget - totalCost);

        console.log(`\n${key}  (${meetings.length} meetings, ${meetings.reduce((n, m) => n + m.docs, 0)} documents, ${meetings.reduce((n, m) => n + m.observed, 0)} observed)`);
        if (!r.exercised.size) {
            console.log('  no observed documents — nothing can be said about this body');
            continue;
        }
        const exercised = [...r.exercised.entries()].sort((a, b) => b[1] - a[1]);
        console.log(`  exercises:  ${exercised.map(([m, n]) => `${m}×${n}`).join(', ')}`);
        console.log(`  covered v4: ${[...r.covered].sort().join(', ') || '(none)'}`);
        if (r.selected.length) {
            for (const s of r.selected) {
                console.log(`  select ${s.meetingId} — ${s.docs} docs, $${s.cost.toFixed(2)} — adds ${s.gain.sort().join(', ')}`);
            }
        } else {
            console.log('  select: (nothing)');
        }
        console.log(`  UNCOVERED:  ${r.uncovered.join(', ') || '(none — every mechanism its corpus shows is proven)'}`);

        plan.push(...r.selected);
        totalDocs += r.selected.reduce((n, s) => n + s.docs, 0);
        totalCost += r.spent;
    }

    console.log(`\n== ${plan.length} meetings, ${totalDocs} documents, ~$${totalCost.toFixed(2)} ==`);

    if (!args.poll) return;

    for (const [i, s] of plan.entries()) {
        console.log(`\n[${i + 1}/${plan.length}] polling ${s.cityId}/${s.meetingId} (${s.docs} docs)`);
        const task = await pollDecisionsForMeeting(s.cityId, s.meetingId, { silent: true, forceExtract: true });
        const status = await waitForTask(task.id);
        console.log(`  ${status}`);
        if (status === 'failed') throw new Error(`poll failed for ${s.cityId}/${s.meetingId} (task ${task.id}) — stopping`);
    }
}

main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
