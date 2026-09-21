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
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { pollDecisionsForMeeting } from '@/lib/tasks/pollDecisions';

const prisma = new PrismaClient();

/** From a Langfuse trace of an 8-document poll costing $1.25. */
const COST_PER_DOCUMENT = 0.157;
const EXTRACTOR_VERSION = '4';
const DEFAULT_OBSERVATIONS = '.extraction-survey/observations-v5.json';

type Observation = Record<string, unknown>;
type SurveyFile = { bodies: Array<{ observations?: Array<{ ada: string; pages: number; observation: Observation }> }> };

/**
 * A mechanism is one thing a document can state that extraction has to handle.
 * Names are the vocabulary of the report; each maps to one survey field.
 */
const MECHANISMS: Array<{ name: string; of: (o: Observation) => boolean }> = [
    { name: 'arrivalOrDeparture', of: o => o.attendanceChangesStated === true },
    { name: 'perVoteAbsence', of: o => o.perVoteAbsenceStated === true },
    { name: 'namesAllVoters', of: o => o.namedVoters === 'all' },
    { name: 'namesDissenters', of: o => o.namedVoters === 'dissenters_only' },
    { name: 'voteCountsInPhrase', of: o => o.votePhraseCarriesCounts === true },
    { name: 'declarations', of: o => o.declarationsRecorded === true },
    { name: 'partialOrPerLineVote', of: o => o.partialOrPerLineVote === true },
    { name: 'substitutes', of: o => o.substitutesPresent === true },
    { name: 'replacedMemberListed', of: o => o.replacedMemberAlsoListed === true },
    { name: 'outOfAgenda', of: o => o.isOutOfAgenda === true },
    { name: 'discussionOrder', of: o => o.discussionOrderStated === true },
    { name: 'withdrawnItems', of: o => o.withdrawnItemsStated === true },
    { name: 'correctedRepost', of: o => o.correctedRepost === true },
    { name: 'embeddedOtherBodyDecision', of: o => o.embeddedOtherBodyDecision === true },
];

/**
 * An attendance change anchored to a decision number is a different code path
 * from one anchored to a clock time, so under --anchors each anchor a body uses
 * counts as its own mechanism. Off by default: it splits `arrivalOrDeparture`
 * into up to five, and a body rarely has meetings enough to cover them all.
 */
function mechanismsOf(o: Observation, anchors: boolean): string[] {
    const found = MECHANISMS.filter(m => m.of(o)).map(m => m.name);
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

async function main() {
    const args = parseArgs();
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
