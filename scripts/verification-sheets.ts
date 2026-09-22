/**
 * One verification sheet per administrative body: what its stored readings say,
 * what we derive from them, and the exact page checks that would settle each
 * doubt — so a person verifies disagreements, not pages.
 *
 *   npx tsx scripts/verification-sheets.ts [--out .context/sheets] [--city chania]
 *
 * Per body it measures, over every meeting with task-v4 readings:
 *  - which office holders (president, secretary, whoever presided) the roll call
 *    has present but the per-decision list (ΤΑ ΜΕΛΗ) leaves out, so the list's
 *    exemptions can be confirmed body by body;
 *  - whether stated arrivals sit inside the roll call's ΠΑΡΟΝΤΕΣ (a cumulative
 *    list) or its ΑΠΟΝΤΕΣ (an opening one), the fact behind presentListMeaning;
 *  - per-vote absences the pages state, against what we derive for that subject;
 *  - the derivation's issues, grouped by code.
 * Each finding is written as a check: a document to open and the one thing to
 * look at, ranked with disagreements first and confirmations last.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
// The production reader, not a second one: this sheet's whole job is telling a
// person whether production reads a body correctly, so every fact it prints
// about a document comes from the same function the derivation reads it with.
import { deriveMeetingFacts, documentFactsFromDecision, loadDerivationInput } from '@/lib/derivation';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import { isConfirmedByPerson, isDecisionConventions } from '@/lib/decisionConventions';
import { loadGolden } from './lib/minutes-golden';

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const opt = (flag: string) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
const OUT = opt('--out') ?? '.context/sheets';
const CITY = opt('--city');

// The stated arrivals and departures, which DocumentFacts does not carry: the
// derivation reads those from AttendanceEvent rows, and this sheet measures the
// document's own sentences against where the roll call puts the same person.
const asObj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const objs = (v: unknown) => (Array.isArray(v) ? v.map(asObj).filter((x): x is Record<string, unknown> => !!x) : []);
const doc = (ada: string) => `[${ada}](https://diavgeia.gov.gr/doc/${ada})`;

type Check = { rank: number; text: string };
const DISAGREE = 0, DOUBT = 1, CONFIRM = 2;

async function main() {
    const golden = new Set(loadGolden().meetings.map(m => `${m.cityId}/${m.meetingId}`));
    const bodies = await prisma.administrativeBody.findMany({
        // A JSON column that holds something: Prisma drops `{ not: undefined }` entirely.
        where: { ...(CITY ? { cityId: CITY } : {}), decisionConventions: { not: Prisma.DbNull } },
        select: { id: true, cityId: true, name: true, decisionConventions: true },
        orderBy: [{ cityId: 'asc' }, { name: 'asc' }],
    });
    const people = new Map<string, { name: string; roles: Array<{ administrativeBodyId: string | null; isHead: boolean; name: string | null; startDate: Date | null; endDate: Date | null }> }>();
    for (const p of await prisma.person.findMany({ select: { id: true, name: true, roles: { select: { administrativeBodyId: true, isHead: true, name: true, startDate: true, endDate: true } } } })) people.set(p.id, p);
    const office = (personId: string, bodyId: string, at: Date) => {
        const p = people.get(personId); if (!p) return null;
        const active = p.roles.filter(r => r.administrativeBodyId === bodyId && (!r.startDate || r.startDate <= at) && (!r.endDate || r.endDate >= at));
        if (active.some(r => r.isHead)) return 'Πρόεδρος';
        const named = active.find(r => r.name === 'Γραμματέας' || r.name === 'Αντιπρόεδρος');
        return named?.name ?? null;
    };
    const nameOf = (id: string) => people.get(id)?.name ?? id;
    // What documentFactsFromDecision checks each extracted id against, as the
    // derivation does: an id of a person since deleted is an unmatched name.
    const rosterPersonIds = new Set(people.keys());

    fs.mkdirSync(OUT, { recursive: true });
    const index: string[] = ['# Verification sheets', '', `Generated ${new Date().toISOString().slice(0, 16)}. One file per body; open the disagreements first.`, '', '| body | meetings read | checks: disagree / doubt / confirm |', '| --- | --- | --- |'];

    for (const b of bodies) {
        const meetings = await prisma.councilMeeting.findMany({
            where: { administrativeBodyId: b.id, subjects: { some: { decision: { extractorVersion: '4' } } } },
            select: { id: true, cityId: true, dateTime: true },
            orderBy: { dateTime: 'asc' },
        });
        if (!meetings.length) { index.push(`| ${b.cityId}/${b.name} | 0 | — (nothing read) |`); continue; }
        // Parsed, as the derivation parses it: a record it would not read is no rule.
        const conv = isDecisionConventions(b.decisionConventions) ? b.decisionConventions : null;
        const confirmed = isConfirmedByPerson(b.decisionConventions);
        const checks: Check[] = [];
        const lines: string[] = [`# ${b.cityId} / ${b.name}`, '', `Conventions: present list **${conv?.presentListMeaning}**, per-decision list as attendance **${conv?.statesPerDecisionAttendance}**, per-vote absence **${conv?.statesPerVoteAbsence}**, secretary left out of the list **${conv?.listOmitsSecretary ?? false}**, confirmed by a person **${confirmed}**.`, ''];
        const omitted = new Map<string, { office: string; in: number; out: number; example: string }>();
        const arrivals = { inPresent: 0, inAbsent: 0, neither: 0, examples: [] as string[] };
        const issuesByCode = new Map<string, number>();

        for (const m of meetings) {
            const key = `${m.cityId}/${m.id}`;
            const input = await loadDerivationInput(m.cityId, m.id);
            const out = deriveMeetingFacts(input);
            for (const i of out.issues) issuesByCode.set(i.code, (issuesByCode.get(i.code) ?? 0) + 1);
            const decisions = await prisma.decision.findMany({
                where: { subject: { cityId: m.cityId, councilMeetingId: m.id }, extractorVersion: '4' },
                // Everything documentFactsFromDecision reads, plus the ada each check links to.
                select: {
                    id: true, ada: true, subjectId: true, extraction: true, voteResultPhrase: true, unmatchedNames: true,
                    incomplete: true, mayorPresent: true, declaredItemNumber: true, declaredOutOfAgenda: true, extractorVersion: true,
                    subject: { select: { agendaItemIndex: true } },
                },
            });
            const presentBySubject = new Map<string, Set<string>>();
            for (const a of out.attendance) if (a.status === 'PRESENT') { if (!presentBySubject.has(a.subjectId)) presentBySubject.set(a.subjectId, new Set()); presentBySubject.get(a.subjectId)!.add(a.personId); }
            lines.push(`## ${m.id} (${m.dateTime.toISOString().slice(0, 10)})${golden.has(key) ? ' — golden' : ''}`, '', `${decisions.length} documents read; derived ${out.attendance.length} attendance rows, ${out.votes.length} votes, ${out.issues.length} issues.`, '');
            for (const d of decisions) {
                const r = asObj(d.extraction); if (!r || !d.ada) continue;
                const facts = documentFactsFromDecision(d, rosterPersonIds);
                const presentIds = facts.rollCallPresentIds ?? []; const absentIds = facts.rollCallAbsentIds ?? [];
                const list = facts.presentIds ?? [];
                const item = d.subject.agendaItemIndex ?? 'OA';
                // office holders present by the roll call but not in ΤΑ ΜΕΛΗ
                if (list.length) for (const pid of presentIds) {
                    const o = office(pid, b.id, m.dateTime) ?? (facts.presidedById === pid ? 'προεδρεύων' : null);
                    if (!o) continue;
                    const k = `${o}:${pid}`; const e = omitted.get(k) ?? { office: o, in: 0, out: 0, example: d.ada };
                    if (list.includes(pid)) e.in++; else { e.out++; e.example = d.ada; }
                    omitted.set(k, e);
                }
                // stated arrivals: inside ΠΑΡΟΝΤΕΣ or ΑΠΟΝΤΕΣ?
                for (const c of objs(r.attendanceChanges)) {
                    if (c.type !== 'arrival' || typeof c.personId !== 'string') continue;
                    if (asObj(c.anchor)?.kind === 'subject') continue; // a per-vote return, not a late arrival
                    // «η κα. Χ αναπληρώνει το απουσιάζον τακτικό μέλος» explains a substitute in the roll call; it is not an arrival (Chania ΔΕ, settled twice).
                    if (/αναπληρών|αναπληρώθηκ/i.test(String(c.rawText))) continue;
                    if (presentIds.includes(c.personId)) arrivals.inPresent++; else if (absentIds.includes(c.personId)) arrivals.inAbsent++; else arrivals.neither++;
                    if (arrivals.examples.length < 2) arrivals.examples.push(`${doc(d.ada)} item ${item}: «${String(c.rawText).slice(0, 110)}»`);
                }
                // per-vote absence vs derived
                const outForVote = objs(r.attendanceChanges).filter(c => asObj(c.anchor)?.kind === 'subject' && c.type === 'departure' && typeof c.personId === 'string');
                if (outForVote.length) {
                    const present = presentBySubject.get(d.subjectId) ?? new Set();
                    const stillPresent = outForVote.filter(c => present.has(c.personId as string)).map(c => nameOf(c.personId as string));
                    const names = outForVote.map(c => nameOf(c.personId as string)).join(', ');
                    if (stillPresent.length) checks.push({ rank: DISAGREE, text: `${doc(d.ada)} item ${item}: the page says ${names} were out for the vote, but we derive **${stillPresent.join(', ')} present**. Read the «απουσίαζαν» sentence and tell me the names.` });
                    else checks.push({ rank: CONFIRM, text: `${doc(d.ada)} item ${item}: page says out for the vote: ${names}; we derive them absent. Confirm the sentence names exactly these.` });
                }
                // a list shorter than roll call − known exemptions with no stated absence: someone left unrecorded?
                if (list.length && conv?.statesPerDecisionAttendance === true) {
                    // The same four the derivation exempts (replayAttendance §3): the body's
                    // head, whoever this page says presided, and — only where the body's rule
                    // leaves the secretary out — the secretary and any acting one.
                    const exempt = new Set([input.presidentPersonId, input.secretaryPersonId, facts.presidedById, input.secretaryPersonId && facts.actingSecretaryId]);
                    const unexplained = presentIds.filter(pid => !list.includes(pid) && !exempt.has(pid) && !outForVote.some(c => c.personId === pid));
                    if (unexplained.length) checks.push({ rank: DOUBT, text: `${doc(d.ada)} item ${item}: ${unexplained.map(nameOf).join(', ')} ${unexplained.length === 1 ? 'is' : 'are'} in the roll call but not in ΤΑ ΜΕΛΗ, with no stated absence — we derive them absent for this decision. Does the page say they left, or is the list just short?` });
                }
            }
            // One doubt per distinct message: a name the roster lacks is one fact, however many pages print it.
            const seenDoubt = new Set<string>();
            for (const i of out.issues.filter(i => i.code === 'UNMATCHED_NAME' || i.code === 'PRESIDING_DISAGREES' || i.code === 'TALLY_MISMATCH')) {
                const msg = issueMessageEn(i); const k = `${i.code}|${msg.replace(/[«»\s]/g, '').toLowerCase()}`;
                if (seenDoubt.has(k)) continue; seenDoubt.add(k);
                const d = decisions.find(x => x.subjectId === i.subjectId);
                const n = out.issues.filter(j => j.code === i.code && issueMessageEn(j).replace(/[«»\s]/g, '').toLowerCase() === msg.replace(/[«»\s]/g, '').toLowerCase()).length;
                checks.push({ rank: DOUBT, text: `${d?.ada ? doc(d.ada) : m.id}${n > 1 ? ` and ${n - 1} more` : ''}: ${i.code} — ${msg}` });
            }
        }

        lines.push('## Who the per-decision list leaves out', '');
        if (!omitted.size) lines.push('No document of this body prints a per-decision list, or none names an office holder.', '');
        else {
            lines.push('| office | person | in the list | left out | example |', '| --- | --- | --- | --- | --- |');
            for (const e of [...omitted.entries()].sort()) {
                const [, pid] = e[0].split(':'); const v = e[1];
                lines.push(`| ${v.office} | ${nameOf(pid)} | ${v.in} | ${v.out} | ${doc(v.example)} |`);
                if (v.office === 'Γραμματέας' && v.out > v.in && conv?.listOmitsSecretary !== true) checks.push({ rank: DISAGREE, text: `The secretary ${nameOf(pid)} is left out of ΤΑ ΜΕΛΗ in ${v.out} of ${v.in + v.out} documents but this body's rule says the list includes the secretary — we derive them absent each time. Open ${doc(v.example)}: is the secretary signing apart from the list? If so the body needs «Ο Γραμματέας δεν αναγράφεται στα Τα Μέλη».` });
                if (v.office === 'Γραμματέας' && v.in > v.out && conv?.listOmitsSecretary === true) checks.push({ rank: DISAGREE, text: `This body's rule says ΤΑ ΜΕΛΗ leaves the secretary out, but ${nameOf(pid)} is inside it in ${v.in} of ${v.in + v.out} documents. Open ${doc(v.example)} and check; the rule may be wrong for this body.` });
            }
            lines.push('');
        }
        lines.push('## Where stated arrivals sit in the roll call', '', `Late arrivals found inside ΠΑΡΟΝΤΕΣ: **${arrivals.inPresent}** (cumulative list) · inside ΑΠΟΝΤΕΣ: **${arrivals.inAbsent}** (opening list) · in neither: ${arrivals.neither}. Stored meaning: **${conv?.presentListMeaning}**.`, ...arrivals.examples.map(e => `- ${e}`), '');
        const measured = arrivals.inPresent + arrivals.inAbsent;
        if (measured && conv?.presentListMeaning === 'unknown') checks.push({ rank: DOUBT, text: `The present list's meaning is stored as unknown, but ${arrivals.inPresent} arrivals sit in ΠΑΡΟΝΤΕΣ and ${arrivals.inAbsent} in ΑΠΟΝΤΕΣ. Open one example above and confirm which; then set presentListMeaning to ${arrivals.inPresent > arrivals.inAbsent ? 'cumulative' : 'opening'}.` });
        if (measured && ((conv?.presentListMeaning === 'opening' && arrivals.inPresent > arrivals.inAbsent) || (conv?.presentListMeaning === 'cumulative' && arrivals.inAbsent > arrivals.inPresent))) checks.push({ rank: DISAGREE, text: `Stored presentListMeaning is **${conv.presentListMeaning}** but the documents point the other way (${arrivals.inPresent} in ΠΑΡΟΝΤΕΣ vs ${arrivals.inAbsent} in ΑΠΟΝΤΕΣ). Open an example above: is the arriving member already in ΠΑΡΟΝΤΕΣ?` });
        lines.push('## Issues the derivation raised', '', ...[...issuesByCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `- ${c} × ${n}`), '');
        if (!confirmed) checks.push({ rank: CONFIRM, text: `The conventions are profiled, not confirmed. Once the checks above hold, confirm them in the admin form (city → Όργανα → ${b.name} → Επιβεβαίωση κανόνων ανάγνωσης).` });

        checks.sort((a, b) => a.rank - b.rank);
        const label = ['DISAGREE', 'DOUBT', 'CONFIRM'];
        lines.splice(3, 0, '## Checks, in order', '', ...checks.map((c, i) => `${i + 1}. **${label[c.rank]}** — ${c.text}`), '');
        const file = `${b.cityId}--${b.name.replace(/\s+/g, '_')}.md`;
        fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n');
        const n = (r: number) => checks.filter(c => c.rank === r).length;
        index.push(`| [${b.cityId}/${b.name}](./${file}) | ${meetings.length} | ${n(DISAGREE)} / ${n(DOUBT)} / ${n(CONFIRM)} |`);
        console.log(`${b.cityId}/${b.name}: ${meetings.length} meetings, ${checks.length} checks (${n(DISAGREE)} disagree)`);
    }
    fs.writeFileSync(path.join(OUT, 'README.md'), index.join('\n') + '\n');
    await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
