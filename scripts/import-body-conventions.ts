/**
 * Seed AdministrativeBody.decisionConventions from the survey in opencouncil-tasks
 * (fixtures/body-conventions.json, plus the reviewed body notes in
 * fixtures/extraction-golden.json). Provenance is 'profile'; a person confirms
 * in admin.
 *
 *   npx tsx scripts/import-body-conventions.ts [path-to-opencouncil-tasks]
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizeAnchors } from '@/lib/decisionConventions';
import type { DecisionConventions, NamedVoters, AttendanceChangeAnchor } from '@/lib/decisionConventions';

const root = process.argv[2] ?? path.resolve(__dirname, '../../../opencouncil-tasks');
const survey = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/body-conventions.json'), 'utf-8'));
const golden = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/extraction-golden.json'), 'utf-8'));

const reviewed = new Map<string, { presentListMeaning?: string; note?: string; perVoteAbsence: boolean; perDecision: boolean }>();
for (const c of golden.cities) {
    for (const b of c.bodies) {
        const docs = b.documents as Array<{ extraction: { perVoteAbsence?: unknown; attendanceChanges: { anchoredBy?: string } } }>;
        reviewed.set(`${c.cityId}/${b.name}`, {
            presentListMeaning: b.conventions?.presentListMeaning,
            note: b.conventions?.structuralNote,
            perVoteAbsence: docs.some(d => !!d.extraction.perVoteAbsence),
            perDecision: docs.some(d => d.extraction.attendanceChanges?.anchoredBy === 'this_document'),
        });
    }
}

/**
 * The survey's vocabulary is not the stored one: `thin` and `contested` are
 * verdicts about its sample, not about the body. Mapping everything it did not
 * recognise to `unknown` silently dropped all eight `opening roll call only`
 * verdicts, leaving seven bodies unsettled that the 2026-09-13 review had in
 * fact settled — and `PRESENCE_UNKNOWN` on every subject of each. An
 * unrecognised value now throws rather than degrading to `unknown`.
 */
const MEANINGS: Record<string, DecisionConventions['presentListMeaning']> = {
    cumulative: 'cumulative',
    'opening roll call only': 'opening',
    untested: 'unknown',
    thin: 'unknown',
    contested: 'unknown',
};

const meaning = (v: string | undefined): DecisionConventions['presentListMeaning'] => {
    if (v === undefined) return 'unknown';
    const m = MEANINGS[v];
    if (!m) throw new Error(`unrecognised presentListMeaning from the survey: ${JSON.stringify(v)}`);
    return m;
};

/**
 * What the survey read wrong, and a person read right. Applied after the
 * derived fields, so a correction beats whatever the sample said. Chalandri's
 * ΔΣ prints ΤΑ ΜΕΛΗ per decision; the survey's anchor question missed it.
 * Vrilissia's committee is `thin` in the survey (one usable page) but was
 * settled from nineteen committee pages on 2026-09-18 — every stated arrival
 * sits in the absent list (spec §11 item 8).
 */
const CORRECTIONS: Record<string, Partial<DecisionConventions>> = {
    'chalandri/Δημοτικό Συμβούλιο': { statesPerDecisionAttendance: true },
    'vrilissia/Δημοτική Επιτροπή': { presentListMeaning: 'opening' },
};

async function main() {
    const prisma = new PrismaClient();
    let written = 0;
    let confirmedSkipped = 0;
    for (const b of survey.bodies) {
        const body = await prisma.administrativeBody.findFirst({ where: { cityId: b.city, name: b.body } });
        if (!body) { console.warn(`no body for ${b.city}/${b.body}`); continue; }
        // A person's confirmation outranks the survey: re-importing must not
        // silently undo what someone stated in admin.
        const stored = body.decisionConventions as { provenance?: { source?: string } } | null;
        if (stored?.provenance?.source === 'manual') {
            confirmedSkipped++;
            console.log(`${b.city}/${b.body}: skipped, confirmed by a person`);
            continue;
        }
        const r = reviewed.get(`${b.city}/${b.body}`);
        const nv = b.votes?.namedVoters ?? {};
        const namedVoters: NamedVoters = (nv.everyVoter ?? 0) > Math.max(nv.never ?? 0, nv.dissentersOnly ?? 0) ? 'all'
            : (nv.dissentersOnly ?? 0) > 0 ? 'dissenters_only' : 'none';
        const anchor = b.attendanceChanges?.anchor as string | undefined;
        // The survey speaks the vocabulary of the day it ran (session_phase,
        // this_document, clock_time); normalizeAnchors maps it to the stored one.
        const anchors: AttendanceChangeAnchor[] = normalizeAnchors(anchor && anchor !== 'nothing' ? [anchor] : []);
        const conventions: DecisionConventions = {
            version: 1,
            rollCallLayout: b.rollCall?.layout ?? 'mixed',
            presentListMeaning: meaning(r?.presentListMeaning ?? b.rollCall?.presentListMeaning),
            attendanceChangeAnchors: anchors,
            statesPerDecisionAttendance: !!r?.perDecision || anchor === 'this_document',
            statesPerVoteAbsence: !!r?.perVoteAbsence,
            usesSubstitutes: (b.substitutes?.documentsWithOne ?? 0) > 0,
            namedVoters,
            mayorStatedSeparately: (b.mayorPresenceStatedPct ?? 0) >= 50,
            notes: r?.note ?? b.reviewNote ?? undefined,
            provenance: { source: 'profile', profiledAt: survey.generatedAt, documentsSampled: b.documentsRead },
        };
        const correction = CORRECTIONS[`${b.city}/${b.body}`];
        if (correction) {
            Object.assign(conventions, correction);
            console.log(`${b.city}/${b.body}: correction ${JSON.stringify(correction)}`);
        }
        await prisma.administrativeBody.update({ where: { id: body.id }, data: { decisionConventions: conventions as object } });
        written++;
        console.log(`${b.city}/${b.body}: ${conventions.rollCallLayout}, present=${conventions.presentListMeaning}, anchors=${conventions.attendanceChangeAnchors.join('|') || '-'}, perDecision=${conventions.statesPerDecisionAttendance}, perVoteAbsence=${conventions.statesPerVoteAbsence}, voters=${namedVoters}`);
    }
    console.log(`${written}/${survey.bodies.length} bodies written, ${confirmedSkipped} left alone as confirmed`);
    await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
