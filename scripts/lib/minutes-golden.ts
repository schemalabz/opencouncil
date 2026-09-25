import fs from 'fs';
import { z } from 'zod';
import type { MinutesData } from '@/lib/minutes/types';

export const GOLDEN_PATH = 'fixtures/minutes-golden.json';

/** What a claim's outcome can be, and what a claim can say to expect of it. */
export const OUTCOMES = ['agree', 'disagree', 'missing'] as const;
export type Outcome = typeof OUTCOMES[number];

const names = z.array(z.string());
const outcome = z.enum(OUTCOMES);
/** A known difference, recorded so a run fails on a change rather than on the difference. */
const expected = outcome.optional();
/**
 * An object that makes several claims expects one outcome of all of them, or one
 * per claim where they differ: a subject whose outcome disagrees and whose named
 * ΚΑΤΑ agree cannot be recorded with one value, since either value fails the other.
 */
const subjectExpected = z.union([outcome, z.object({
    outcome: expected, for: expected, against: expected, blank: expected, declaredPresent: expected,
    declaredAbstain: expected, present: expected, absent: expected, decisionNumber: expected,
}).strict()]).optional();
const rollCallExpected = z.union([outcome, z.object({ present: expected, absent: expected, mayorPresent: expected, president: expected }).strict()]).optional();

/** What the fixture expects of one of the claims an object makes; `agree` unless it says otherwise. */
export function expectedOf<K extends string>(expect: Outcome | Partial<Record<K, Outcome>> | undefined, key: K): Outcome {
    if (expect === undefined) return 'agree';
    return typeof expect === 'string' ? expect : expect[key] ?? 'agree';
}

/**
 * The fixture as a schema, strict at every level.
 *
 * A misspelt claim key is not a claim at all: the checker reads the keys it
 * knows and says nothing about the rest, so a typo leaves the run green having
 * tested one thing fewer. Strict parsing makes it a load error instead.
 */
const claimSchema = z.object({
    outcome: z.enum(['unanimous', 'majority']).optional(),
    for: names.optional(),
    against: names.optional(),
    blank: names.optional(),
    declaredPresent: names.optional(),
    declaredAbstain: names.optional(),
    present: names.optional(),
    absent: names.optional(),
    decisionNumber: z.string().optional(),
    expect: subjectExpected,
}).strict();

const changeSchema = z.object({
    name: z.string(),
    kind: z.enum(['arrival', 'departure']),
    /** The sentence the source prints, for the person reading a disagreement. */
    asPrinted: z.string().optional(),
    anchor: z.object({
        kind: z.string(),
        agendaItemIndex: z.number().optional(),
        timing: z.string().optional(),
        decisionNumber: z.string().optional(),
    }).strict(),
    expect: expected,
}).strict();

const meetingSchema = z.object({
    cityId: z.string(),
    meetingId: z.string(),
    /** `official-minutes` is the municipality's own πρακτικό, `documents` the reviewed extracts. */
    source: z.string(),
    sourceRef: z.string().optional(),
    notes: z.string().optional(),
    rollCall: z.object({
        president: z.string().optional(),
        mayorPresent: z.boolean().optional(),
        present: names,
        absent: names,
        remote: names.optional(),
        expect: rollCallExpected,
    }).strict().optional(),
    changes: z.array(changeSchema).optional(),
    withdrawn: z.array(z.number()).optional(),
    subjects: z.record(claimSchema),
}).strict();

const fixtureSchema = z.object({
    version: z.literal(1),
    description: z.string(),
    meetings: z.array(meetingSchema),
}).strict();

export type Claim = z.infer<typeof claimSchema>;
export type GoldenMeeting = z.infer<typeof meetingSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;

export const loadGolden = (path = GOLDEN_PATH): Fixture =>
    fixtureSchema.parse(JSON.parse(fs.readFileSync(path, 'utf-8')));

/**
 * The key a fixture names a subject by: its agenda item number, or `OA<n>` for
 * the n-th out-of-agenda subject in the order the minutes print them.
 */
export function subjectsByClaimKey(data: MinutesData) {
    let oa = 0;
    const byKey = new Map<string, MinutesData['subjects'][number]>();
    const keyBySubjectId = new Map<string, string>();
    for (const s of data.subjects) {
        const k = s.nonAgendaReason === 'outOfAgenda' ? `OA${++oa}` : String(s.agendaItemIndex);
        byKey.set(k, s); keyBySubjectId.set(s.subjectId, k);
    }
    return { byKey, keyBySubjectId };
}
