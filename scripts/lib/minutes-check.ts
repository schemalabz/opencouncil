/**
 * Compare the MinutesData a meeting renders from against fixtures/minutes-golden.json.
 *
 * `checkMeeting` returns one line per claim the fixture makes about that meeting —
 * roll call (including the mayor and the president), arrivals and departures,
 * per-subject presence and votes — as agree, disagree or missing, with the
 * names that differ. Names match through normalisation: accents, case, order,
 * parenthetical nicknames, initials.
 *
 * A claim is expected to agree unless it carries `"expect"`. The caller compares
 * each outcome with what it expects, so the baseline lives in the fixture rather
 * than in a person's memory of the last run.
 */
import type { MinutesData, MinutesMember } from '@/lib/minutes/types';
import { buildRollCall } from '@/lib/minutes/builders';
import { expectedOf, subjectsByClaimKey, type GoldenMeeting, type Outcome } from './minutes-golden';

const norm = (n: string) => n
    .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[‐-―−]/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (n: string) => norm(n).split(/[\s-]+/).filter(Boolean);
/** `a` names the same person as `b` when every whole word of one is in the other and initials open remaining words. */
export function samePerson(a: string, b: string): boolean {
    const test = (short: string, full: string) => {
        const fullWords = words(full); const initials: string[] = []; const whole: string[] = [];
        for (const w of words(short)) { if (w.endsWith('.')) initials.push(w.slice(0, -1)); else if (w.length === 1) initials.push(w); else whole.push(w); }
        if (!whole.length) return false;
        const rest = [...fullWords];
        for (const w of whole) { const i = rest.indexOf(w); if (i < 0) return false; rest.splice(i, 1); }
        for (const c of initials) { const i = rest.findIndex(w => w.startsWith(c)); if (i < 0) return false; rest.splice(i, 1); }
        return true;
    };
    return norm(a) === norm(b) || test(a, b) || test(b, a) || sameSurname(a, b);
}
const has = (list: string[], name: string) => list.some(n => samePerson(n, name));
/** Surname tokens, including a parenthetical alias («Ρασσιάς (Ρώμας)»), for the fallback below. */
const surnameTokens = (n: string) => n.replace(/[‐-―−]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[()]/g, ' ').split(/\s+/).filter(t => t.length >= 5);
/** Tokens written inside parentheses only — an explicit alias, nickname or maiden name. */
const aliasTokens = (n: string) => [...n.matchAll(/\(([^)]*)\)/g)].flatMap(m => surnameTokens(m[1]));
/**
 * Two shapes of the same mismatch, neither sharing a whole word or an initial:
 * official minutes write «Firstname(s) Surname» («Κωνσταντίνα – Ολυμπία Καραγιάννη»)
 * where the roster writes «Surname Firstname» («Τάνια Καραγιάννη») — the surname
 * opens one name and closes the other; or one side spells out a nickname the other
 * gives in parentheses («Παπαναστασόπουλος Κωνσταντίνος (Κωστής)» / «Παπαναστασόπουλος
 * Κωστής»). A token shared at the SAME end of both names, with neither in parentheses,
 * is a common first name, or two different people who share that surname, not this
 * one — `Κουράσης Ευθύμιος` and `Κουράσης Ιωάννης` must not merge on `Κουράσης`.
 */
function sameSurname(a: string, b: string): boolean {
    const ta = surnameTokens(a), tb = surnameTokens(b);
    if (!ta.length || !tb.length) return false;
    if (ta[ta.length - 1] === tb[0] || tb[tb.length - 1] === ta[0]) return true;
    return aliasTokens(a).some(t => tb.includes(t)) || aliasTokens(b).some(t => ta.includes(t));
}
/**
 * A surname shared by exactly one name on each side settles a pair the strict
 * match above missed — unlike `samePerson`'s single-pair fallback, this must
 * stay unique so two different people who happen to share a surname don't merge.
 */
function diffSets(want: string[], got: string[]): { lost: string[]; extra: string[] } {
    let lost = want.filter(w => !has(got, w));
    let extra = got.filter(g => !has(want, g));
    for (const w of [...lost]) {
        const candidates = extra.filter(g => sameSurname(w, g));
        if (candidates.length === 1 && lost.filter(l => sameSurname(l, candidates[0])).length === 1) {
            lost = lost.filter(l => l !== w); extra = extra.filter(g => g !== candidates[0]);
        }
    }
    return { lost, extra };
}
const names = (ms: MinutesMember[] | null | undefined) => (ms ?? []).map(m => m.name);

/**
 * One line `checkMeeting` returns. A claim line carries what the fixture expects
 * of it — `agree` unless the claim says otherwise — and the caller fails the run
 * on any claim whose outcome is not that. An issue line is what the derivation
 * flagged: printed beside the claims and counted apart from them, which is what
 * `kind` is for.
 */
export type CheckLine =
    | { kind: 'claim'; meeting: string; claim: string; outcome: Outcome; expect: Outcome; detail: string }
    | { kind: 'issue'; meeting: string; claim: string; detail: string };

export function checkMeeting(m: GoldenMeeting, data: MinutesData): CheckLine[] {
    const key = `${m.cityId}/${m.meetingId}`;
    const lines: CheckLine[] = [];
    const claimLine = (claim: string, outcome: Outcome, detail: string, expect: Outcome = 'agree') =>
        lines.push({ kind: 'claim', meeting: key, claim, outcome, expect, detail });
    const report = (claim: string, want: string[], got: string[] | null, expect: Outcome = 'agree') => {
        if (got === null) { claimLine(claim, 'missing', `wanted ${want.length}`, expect); return; }
        const d = diffSets(want, got);
        const detail = [d.lost.length ? `lost: ${d.lost.join(', ')}` : '', d.extra.length ? `extra: ${d.extra.join(', ')}` : ''].filter(Boolean).join('; ');
        claimLine(claim, detail ? 'disagree' : 'agree', detail, expect);
    };

    // The roll call the minutes print, read from the one builder the minutes use.
    const rollCall = data.councilComposition
        ? buildRollCall(data.councilComposition, new Set((data.absentMembers ?? []).map(a => a.personId)), data.administrativeBody?.type ?? null)
        : null;
    if (m.rollCall) {
        // A council's mayor is on the ΔΗΜΑΡΧΟΣ line; a mayor who is not a member of a
        // committee is not printed. Either way the lists leave them out, so the fixture's
        // lists are compared without them. A member mayor is in the lists like any member.
        const cityMayor = data.councilComposition?.mayor ?? null;
        const mayorApart = cityMayor && rollCall && ![...rollCall.present, ...rollCall.absent].some(e => e.member.personId === cityMayor.personId)
            ? cityMayor.name : null;
        const notMayorApart = (n: string) => !mayorApart || !samePerson(n, mayorApart);
        const present = (rollCall?.present ?? []).map(e => e.member.name);
        // The minutes print an absent council president on the president's line, not in the
        // absence sentence; the fixture's absent list is compared with the president added back.
        // A committee's absent list already holds an absent president, so nothing is added there.
        const president = rollCall?.president ?? null;
        const absent = [
            ...(rollCall?.absent ?? []).map(e => e.member.name),
            ...(president?.absent && !rollCall?.absent.some(e => e.member.personId === president.personId) ? [president.name] : []),
        ];
        report('rollCall.present', m.rollCall.present.filter(notMayorApart), present, expectedOf(m.rollCall.expect, 'present'));
        report('rollCall.absent', m.rollCall.absent.filter(notMayorApart), absent, expectedOf(m.rollCall.expect, 'absent'));
        if (m.rollCall.mayorPresent !== undefined) {
            const got = rollCall?.mayor ? !rollCall.mayor.absent : null;
            lines.push({ kind: 'claim', meeting: key, claim: 'rollCall.mayorPresent', outcome: got === null ? 'missing' : got === m.rollCall.mayorPresent ? 'agree' : 'disagree',
                expect: expectedOf(m.rollCall.expect, 'mayorPresent'), detail: got === null ? 'no mayor line' : `wanted ${m.rollCall.mayorPresent}, got ${got}` });
        }
        if (m.rollCall.president) {
            const got = president?.name ?? null;
            lines.push({ kind: 'claim', meeting: key, claim: 'rollCall.president', outcome: got === null ? 'missing' : samePerson(got, m.rollCall.president) ? 'agree' : 'disagree',
                expect: expectedOf(m.rollCall.expect, 'president'), detail: got ?? 'no president line' });
        }
    }
    const mayorLine = rollCall?.mayor ?? null;
    for (const c of m.changes ?? []) {
        // A council's mayor is never in the changes block: their movement is the note on the ΔΗΜΑΡΧΟΣ line.
        if (mayorLine && samePerson(c.name, mayorLine.name)) {
            const note = mayorLine.note ?? '';
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
            claimLine(`mayor ${c.kind}`, !note ? 'missing' : ok ? 'agree' : 'disagree', note || 'no mayor note', c.expect);
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
        claimLine(
            `change ${c.kind} ${c.name}`,
            got.length === 0 ? 'missing' : gotAt.includes(want) ? 'agree' : 'disagree',
            got.length === 0 ? `wanted at ${want}` : gotAt.includes(want) ? '' : `wanted at ${want}, got at ${gotAt.join(', ')}`,
            c.expect,
        );
    }
    const { byKey } = subjectsByClaimKey(data);
    for (const w of m.withdrawn ?? []) {
        const s = byKey.get(String(w));
        claimLine(`withdrawn #${w}`, s?.withdrawn ? 'agree' : s ? 'disagree' : 'missing', s ? '' : 'no such subject');
    }
    for (const [k, claim] of Object.entries(m.subjects)) {
        const s = byKey.get(k);
        // A subject the minutes lack fails every claim it makes alike, so only a single outcome records it.
        if (!s) { claimLine(`subject ${k}`, 'missing', 'no such subject in minutes data', typeof claim.expect === 'string' ? claim.expect : 'agree'); continue; }
        const v = s.voteResult;
        if (claim.outcome) {
            // A phrase-only result reports the outcome the page named, and none when the page named none.
            const gotOutcome = !v ? null : v.fromPhraseOnly ? v.outcome : v.isUnanimous ? 'unanimous' : 'majority';
            claimLine(`subject ${k} outcome`, gotOutcome === null ? 'missing' : gotOutcome === claim.outcome ? 'agree' : 'disagree', gotOutcome === null ? 'no vote' : gotOutcome === claim.outcome ? '' : `wanted ${claim.outcome}, got ${gotOutcome}`, expectedOf(claim.expect, 'outcome'));
        }
        if (claim.against) report(`subject ${k} against`, claim.against, v ? names(v.againstMembers) : null, expectedOf(claim.expect, 'against'));
        if (claim.blank) report(`subject ${k} blank`, claim.blank, v ? names(v.abstainMembers) : null, expectedOf(claim.expect, 'blank'));
        if (claim.declaredPresent) report(`subject ${k} declared παρών`, claim.declaredPresent, v ? names(v.presentMembers) : null, expectedOf(claim.expect, 'declaredPresent'));
        if (claim.declaredAbstain) report(`subject ${k} declared αποχή`, claim.declaredAbstain, v ? names(v.didNotVoteMembers) : null, expectedOf(claim.expect, 'declaredAbstain'));
        if (claim.for) report(`subject ${k} for`, claim.for, v ? names(v.forMembers) : null, expectedOf(claim.expect, 'for'));
        if (claim.present) report(`subject ${k} present`, claim.present, s.attendance ? names(s.attendance.present) : null, expectedOf(claim.expect, 'present'));
        if (claim.absent) {
            // A fixture absent list names who left; the checker asks only that each of them is absent here.
            const got = s.attendance ? names(s.attendance.absent) : null;
            if (got === null) claimLine(`subject ${k} absent`, 'missing', '', expectedOf(claim.expect, 'absent'));
            else { const lost = claim.absent.filter(n => !has(got, n)); claimLine(`subject ${k} absent`, lost.length ? 'disagree' : 'agree', lost.length ? `still present: ${lost.join(', ')}` : '', expectedOf(claim.expect, 'absent')); }
        }
        if (claim.decisionNumber) {
            const got = s.decision?.decisionNumber ?? null;
            claimLine(`subject ${k} decisionNumber`, got === null ? 'missing' : got.split('/')[0] === claim.decisionNumber ? 'agree' : 'disagree', got ?? '', expectedOf(claim.expect, 'decisionNumber'));
        }
    }
    return lines;
}
