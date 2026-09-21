/**
 * Check the MinutesData a meeting renders from against fixtures/minutes-golden.json.
 *
 *   npx tsx scripts/check-minutes.ts [--derive] [cityId/meetingId ...]
 *
 * The check reads the rows a meeting last derived to. After a rule or a convention
 * changes those rows are stale, and the numbers describe the old rule: --derive
 * derives each meeting first.
 *
 * Per meeting it prints one line per claim the fixture makes — roll call,
 * arrivals and departures, per-subject presence and votes — as agree,
 * disagree or missing, with the names that differ. Names match through
 * normalisation: accents, case, order, parenthetical nicknames, initials.
 */
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import type { MinutesMember } from '@/lib/minutes/types';
import { deriveAndPersist, explainMeeting } from '@/lib/derivation';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import { loadGolden, subjectsByClaimKey, type GoldenMeeting } from './lib/minutes-golden';

const norm = (n: string) => n
    .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[‐-―−]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (n: string) => norm(n).split(/[\s-]+/).filter(Boolean);
/** `a` names the same person as `b` when every whole word of one is in the other and initials open remaining words. */
function samePerson(a: string, b: string): boolean {
    const test = (short: string, full: string) => {
        const fullWords = words(full); const initials: string[] = []; const whole: string[] = [];
        for (const w of words(short)) { if (w.endsWith('.')) initials.push(w.slice(0, -1)); else if (w.length === 1) initials.push(w); else whole.push(w); }
        if (!whole.length) return false;
        const rest = [...fullWords];
        for (const w of whole) { const i = rest.indexOf(w); if (i < 0) return false; rest.splice(i, 1); }
        for (const c of initials) { const i = rest.findIndex(w => w.startsWith(c)); if (i < 0) return false; rest.splice(i, 1); }
        return true;
    };
    return norm(a) === norm(b) || test(a, b) || test(b, a);
}
const has = (list: string[], name: string) => list.some(n => samePerson(n, name));
/** Surname tokens, including a parenthetical alias («Ρασσιάς (Ρώμας)»), for the fallback below. */
const surnameTokens = (n: string) => n.replace(/[‐-―−]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[()]/g, ' ').split(/\s+/).filter(t => t.length >= 5);
/**
 * Official minutes print formal first names («Ευτέρπη») where the roster holds the
 * common one («Έπη»). When the strict match fails, a surname shared by exactly one
 * name on each side settles it.
 */
function diffSets(want: string[], got: string[]): { lost: string[]; extra: string[] } {
    let lost = want.filter(w => !has(got, w));
    let extra = got.filter(g => !has(want, g));
    for (const w of [...lost]) {
        const ws = surnameTokens(w);
        const candidates = extra.filter(g => surnameTokens(g).some(t => ws.includes(t)));
        if (candidates.length === 1 && lost.filter(l => surnameTokens(l).some(t => surnameTokens(candidates[0]).includes(t))).length === 1) {
            lost = lost.filter(l => l !== w); extra = extra.filter(g => g !== candidates[0]);
        }
    }
    return { lost, extra };
}
const names = (ms: MinutesMember[] | null | undefined) => (ms ?? []).map(m => m.name);

type Outcome = 'agree' | 'disagree' | 'missing';
const lines: Array<{ meeting: string; claim: string; outcome: Outcome; detail: string }> = [];
const report = (meeting: string, claim: string, want: string[], got: string[] | null) => {
    if (got === null) { lines.push({ meeting, claim, outcome: 'missing', detail: `wanted ${want.length}` }); return; }
    const d = diffSets(want, got);
    const detail = [d.lost.length ? `lost: ${d.lost.join(', ')}` : '', d.extra.length ? `extra: ${d.extra.join(', ')}` : ''].filter(Boolean).join('; ');
    lines.push({ meeting, claim, outcome: detail ? 'disagree' : 'agree', detail });
};

async function checkMeeting(m: GoldenMeeting) {
    const key = `${m.cityId}/${m.meetingId}`;
    const data = await getMinutesData(m.cityId, m.meetingId);
    if (m.rollCall) {
        // The mayor is printed on their own line, never in the member lists; compare them apart.
        const mayor = data.councilComposition?.mayor?.name ?? null;
        const notMayor = (n: string) => !mayor || !samePerson(n, mayor);
        // A substitute who sat in is present; the minutes keep substitutes in their own list.
        const present = [...names(data.councilComposition?.members), ...names(data.councilComposition?.substituteMembers)].filter(n => !has(names(data.absentMembers), n)).filter(notMayor);
        report(key, 'rollCall.present', m.rollCall.present.filter(notMayor), present);
        report(key, 'rollCall.absent', m.rollCall.absent.filter(notMayor), names(data.absentMembers).filter(notMayor));
    }
    const mayorName = data.councilComposition?.mayor?.name ?? null;
    for (const c of m.changes ?? []) {
        // The mayor is never in the changes block: their movement is the note on the ΔΗΜΑΡΧΟΣ line.
        if (mayorName && samePerson(c.name, mayorName)) {
            const note = data.councilComposition?.mayor?.note ?? '';
            const verb = c.kind === 'arrival' ? 'προσήλθε' : 'αποχώρησε';
            // The position is resolved along the discussion order, as the minutes do: «after item 8»
            // is whatever was discussed next, which on a reordered meeting may be item 1.
            let idx: number | null = null;
            if (c.anchor.kind === 'agenda_item' && c.anchor.agendaItemIndex != null) {
                const order = data.subjects.filter(s => !s.withdrawn);
                const at = order.findIndex(s => s.agendaItemIndex === c.anchor.agendaItemIndex && s.nonAgendaReason !== 'outOfAgenda');
                const target = at < 0 ? null : order[Math.min(at + (c.anchor.timing === 'after' ? 1 : 0), order.length - 1)];
                idx = target?.agendaItemIndex ?? null;
            }
            const ok = note.includes(verb) && (idx === null || note.includes(`${idx}ο`));
            lines.push({ meeting: key, claim: `mayor ${c.kind}`, outcome: !note ? 'missing' : ok ? 'agree' : 'disagree', detail: note || 'no mayor note' });
            continue;
        }
        const got = (data.attendanceChanges ?? []).filter(x => x.type === c.kind && samePerson(x.name, c.name));
        // A decision-number anchor is satisfied by the subject that holds that decision.
        const subjectOfDecision = (n: string) => data.subjects.find(s => (s.decision?.decisionNumber ?? '').split('/')[0] === n);
        const want = c.anchor.kind === 'agenda_item' ? `#${c.anchor.agendaItemIndex}`
            : c.anchor.kind === 'decision_number' && c.anchor.decisionNumber && subjectOfDecision(c.anchor.decisionNumber)
                ? `#${subjectOfDecision(c.anchor.decisionNumber)!.agendaItemIndex}`
                : `${c.anchor.kind}:${c.anchor.decisionNumber ?? ''}`;
        const gotAt = got.map(x => x.atSubject?.agendaItemIndex != null ? `#${x.atSubject.agendaItemIndex}` : (x.atSubject ? 'OA' : 'session'));
        lines.push({
            meeting: key, claim: `change ${c.kind} ${c.name}`,
            outcome: got.length === 0 ? 'missing' : gotAt.includes(want) ? 'agree' : 'disagree',
            detail: got.length === 0 ? `wanted at ${want}` : gotAt.includes(want) ? '' : `wanted at ${want}, got at ${gotAt.join(', ')}`,
        });
    }
    const { byKey, keyBySubjectId } = subjectsByClaimKey(data);
    for (const w of m.withdrawn ?? []) {
        const s = byKey.get(String(w));
        lines.push({ meeting: key, claim: `withdrawn #${w}`, outcome: s?.withdrawn ? 'agree' : s ? 'disagree' : 'missing', detail: s ? '' : 'no such subject' });
    }
    for (const [k, claim] of Object.entries(m.subjects)) {
        const s = byKey.get(k);
        if (!s) { lines.push({ meeting: key, claim: `subject ${k}`, outcome: 'missing', detail: 'no such subject in minutes data' }); continue; }
        const v = s.voteResult;
        if (claim.outcome) {
            // A phrase-only result reports the outcome the page named, and none when the page named none.
            const gotOutcome = !v ? null : v.fromPhraseOnly ? v.outcome : v.isUnanimous ? 'unanimous' : 'majority';
            lines.push({ meeting: key, claim: `subject ${k} outcome`, outcome: gotOutcome === null ? 'missing' : gotOutcome === claim.outcome ? 'agree' : 'disagree', detail: gotOutcome === null ? 'no vote' : gotOutcome === claim.outcome ? '' : `wanted ${claim.outcome}, got ${gotOutcome}` });
        }
        if (claim.against) report(key, `subject ${k} against`, claim.against, v ? names(v.againstMembers) : null);
        if (claim.blank) report(key, `subject ${k} blank`, claim.blank, v ? names(v.abstainMembers) : null);
        if (claim.declaredPresent) report(key, `subject ${k} declared παρών`, claim.declaredPresent, v ? names(v.presentMembers) : null);
        if (claim.declaredAbstain) report(key, `subject ${k} declared αποχή`, claim.declaredAbstain, v ? names(v.didNotVoteMembers) : null);
        if (claim.for) report(key, `subject ${k} for`, claim.for, v ? names(v.forMembers) : null);
        if (claim.present) report(key, `subject ${k} present`, claim.present, s.attendance ? names(s.attendance.present) : null);
        if (claim.absent) {
            // A fixture absent list names who left; the checker asks only that each of them is absent here.
            const got = s.attendance ? names(s.attendance.absent) : null;
            if (got === null) lines.push({ meeting: key, claim: `subject ${k} absent`, outcome: 'missing', detail: '' });
            else { const lost = claim.absent.filter(n => !has(got, n)); lines.push({ meeting: key, claim: `subject ${k} absent`, outcome: lost.length ? 'disagree' : 'agree', detail: lost.length ? `still present: ${lost.join(', ')}` : '' }); }
        }
        if (claim.decisionNumber) {
            const got = s.decision?.decisionNumber ?? null;
            lines.push({ meeting: key, claim: `subject ${k} decisionNumber`, outcome: got === null ? 'missing' : got.split('/')[0] === claim.decisionNumber ? 'agree' : 'disagree', detail: got ?? '' });
        }
    }
    // What the derivation flagged for this meeting, printed beside the claims (not counted).
    const explained = await explainMeeting(m.cityId, m.meetingId);
    for (const i of explained.issues) {
        const where = i.subjectId ? (keyBySubjectId.get(i.subjectId) ?? i.subjectId) : '-';
        lines.push({ meeting: key, claim: `issue ${i.code}`, outcome: 'agree', detail: `${where} ${i.personId ?? ''} ${issueMessageEn(i)}`.replace(/\s+/g, ' ').trim() });
    }
}

async function main() {
    const fixture = loadGolden();
    const derive = process.argv.includes('--derive');
    const only = process.argv.slice(2).filter(a => a !== '--derive');
    const meetings = fixture.meetings.filter(m => only.length === 0 || only.includes(`${m.cityId}/${m.meetingId}`));
    for (const m of meetings) {
        if (derive) await deriveAndPersist(m.cityId, m.meetingId);
        await checkMeeting(m);
    }
    let current = '';
    for (const l of lines) {
        if (l.meeting !== current) { current = l.meeting; console.log(`\n${current}`); }
        console.log(`  ${l.outcome.padEnd(8)} ${l.claim.padEnd(40)} ${l.detail}`);
    }
    const claims = lines.filter(l => !l.claim.startsWith('issue '));
    const issues = lines.length - claims.length;
    const tally = (o: Outcome) => claims.filter(l => l.outcome === o).length;
    console.log(`\n${meetings.length} meetings, ${claims.length} claims: ${tally('agree')} agree, ${tally('disagree')} disagree, ${tally('missing')} missing; ${issues} issues`);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
