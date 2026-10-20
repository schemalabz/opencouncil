import { checkAgendaIdentity, holdsAnotherMeeting, reconcileAgendaMeetingRecord, type RecordedMeeting, type SiblingCandidate } from '../agendaMeetingRecord';
import type { AgendaMeetingRecord } from '../apiTypes';

const recorded = (overrides: Partial<RecordedMeeting> = {}): RecordedMeeting => ({
    kind: null,
    urgent: false,
    sessionNumber: null,
    format: 'inPerson',
    continuationOfId: null,
    bodyType: 'council',
    ...overrides,
});

const read = (overrides: Partial<AgendaMeetingRecord> = {}): AgendaMeetingRecord => ({
    kind: 'ordinary',
    kindEvidence: 'συνεδρίαση',
    urgent: true,
    urgentEvidence: 'κατεπείγουσα συνεδρίαση',
    sessionNumber: 14,
    sessionNumberEvidence: '14η Συνεδρίαση',
    format: 'remote',
    formatEvidence: 'με τηλεδιάσκεψη',
    ...overrides,
});

describe('reconcileAgendaMeetingRecord', () => {
    it('fills what the record lacks and compares what it holds', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(
            recorded({ kind: 'budget' }),
            read(),
            { formatChosen: true },
        );
        expect(patch).toEqual({ urgent: true, sessionNumber: 14 });
        expect(mismatches.map((m) => [m.field, m.recorded, m.read])).toEqual([
            ['kind', 'budget', 'ordinary'],
            ['format', 'inPerson', 'remote'],
        ]);
    });

    it('fills the format of an archive meeting, which holds the default, not a choice', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(recorded(), read(), { formatChosen: false });
        expect(patch).toEqual({ kind: 'ordinary', urgent: true, sessionNumber: 14, format: 'remote' });
        expect(mismatches).toEqual([]);
    });

    it('fills a format that was left empty, even on a meeting whose other fields a person chose', () => {
        const { patch } = reconcileAgendaMeetingRecord(recorded({ kind: 'ordinary', format: null }), read(), { formatChosen: true });
        expect(patch.format).toBe('remote');
    });

    it('fills a meeting by circulation like any other format', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(recorded({ format: null }), read({ format: 'byCirculation' }), { formatChosen: true });
        expect(patch.format).toBe('byCirculation');
        expect(mismatches).toEqual([]);
    });

    it('reports an invitation by circulation that differs from a chosen format', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(recorded(), read({ format: 'byCirculation' }), { formatChosen: true });
        expect(patch.format).toBeUndefined();
        expect(mismatches.map((m) => [m.field, m.recorded, m.read])).toEqual([['format', 'inPerson', 'byCirculation']]);
    });

    it('gives a later part of a meeting no kind, no urgency and no number', () => {
        const { patch } = reconcileAgendaMeetingRecord(recorded({ continuationOfId: 'jan8_2026' }), read(), { formatChosen: false });
        expect(patch).toEqual({ format: 'remote' });
    });

    it('changes nothing for values the invitation does not state or that agree', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(
            recorded({ kind: 'ordinary', urgent: true, sessionNumber: 14, format: 'remote' }),
            read(),
            { formatChosen: true },
        );
        expect(patch).toEqual({});
        expect(mismatches).toEqual([]);
        expect(reconcileAgendaMeetingRecord(recorded(), read({ kind: null, urgent: false, urgentEvidence: null, sessionNumber: null, format: null }), { formatChosen: false }))
            .toEqual({ patch: {}, mismatches: [] });
    });

    it('never unsets an urgency, and reports one that the invitation does not state', () => {
        // `urgent` defaults to false, so only true is a statement of the record.
        const { patch, mismatches } = reconcileAgendaMeetingRecord(
            recorded({ kind: 'ordinary', urgent: true }),
            read({ urgent: false, urgentEvidence: null }),
            { formatChosen: true },
        );
        expect(patch).not.toHaveProperty('urgent');
        expect(mismatches.map((m) => m.field)).toEqual(['urgent', 'format']);
    });

    it('compares no urgency where the caller withholds it, as for a combined record', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(recorded({ urgent: true }), { ...read({ kind: null }), urgent: null }, { formatChosen: false });
        expect(patch).toEqual({ sessionNumber: 14, format: 'remote' });
        expect(mismatches).toEqual([]);
    });

    it('reports a kind this platform does not know yet instead of writing it', () => {
        // processAgenda deploys apart from the app: a newer task can name a kind this database lacks.
        const unknown = 'committeeReport' as AgendaMeetingRecord['kind'];
        const { patch, mismatches } = reconcileAgendaMeetingRecord(recorded(), read({ kind: unknown }), { formatChosen: false });
        expect(patch.kind).toBeUndefined();
        expect(mismatches[0]).toMatchObject({ field: 'kind', read: 'committeeReport (unknown to this version of the platform)' });
    });

    it('reports a council-only kind on a committee instead of proposing what the rules refuse', () => {
        const { patch, mismatches } = reconcileAgendaMeetingRecord(
            recorded({ bodyType: 'committee' }),
            read({ kind: 'accountability' }),
            { formatChosen: false },
        );
        expect(patch).toEqual({ urgent: true, sessionNumber: 14, format: 'remote' });
        expect(mismatches.map((m) => [m.field, m.recorded, m.read])).toEqual([['kind', null, 'accountability']]);
    });
});

describe('checkAgendaIdentity', () => {
    const ours = { municipality: 'Δήμος Χαλανδρίου', date: '2026-09-30', time: '20:00' };
    const cities = ['Δήμος Ζωγράφου', 'Δήμος Πάρου', 'Δήμος Αθηναίων'];
    const inAgenda = (overrides: object = {}) => ({
        kind: 'ordinary' as const, kindEvidence: null, urgent: false, urgentEvidence: null, sessionNumber: null, sessionNumberEvidence: null, format: null, formatEvidence: null,
        municipality: 'ΔΗΜΟΣ ΧΑΛΑΝΔΡΙΟΥ', bodyName: 'ΔΗΜΟΤΙΚΟΥ ΣΥΜΒΟΥΛΙΟΥ', ofThisBody: true, date: '2026-09-30', time: '20:00',
        subjectCount: 3, isThisMeeting: true, ...overrides,
    });

    it('accepts the invitation of this municipality, whatever the case, accents, dashes or «Δήμου»', () => {
        expect(checkAgendaIdentity(ours, [inAgenda()], cities)).toEqual({ refusal: null, differences: [] });
        expect(checkAgendaIdentity(ours, [inAgenda({ municipality: 'Δήμου Χαλανδρίου' })], cities).differences).toEqual([]);
        const argos = { ...ours, municipality: 'Δήμος Άργους-Μυκηνών' };
        expect(checkAgendaIdentity(argos, [inAgenda({ municipality: 'ΔΗΜΟΣ ΑΡΓΟΥΣ — ΜΥΚΗΝΩΝ' })], cities).differences).toEqual([]);
    });

    it('refuses only an agenda that names another city of the platform', () => {
        expect(checkAgendaIdentity(ours, [inAgenda({ municipality: 'ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ' })], cities).refusal).toBe('the agenda is from ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ, not Δήμος Χαλανδρίου');
    });

    it('reports a municipality that is no city of ours, a typo or a misreading, and keeps the agenda', () => {
        // Ξυλόκαστρο mar12_2025 prints «Ευροστίνης».
        const xylokastro = { ...ours, municipality: 'Δήμος Ξυλοκάστρου - Ευρωστίνης' };
        expect(checkAgendaIdentity(xylokastro, [inAgenda({ municipality: 'Δήμος Ξυλοκάστρου – Ευροστίνης' })], cities)).toEqual({
            refusal: null,
            differences: ['municipality: the agenda prints Δήμος Ξυλοκάστρου – Ευροστίνης, the city is Δήμος Ξυλοκάστρου - Ευρωστίνης'],
        });
    });

    it('never takes one municipality for another whose name contains it', () => {
        // Πάρος and Αντίπαρος are two municipalities.
        const antiparos = { ...ours, municipality: 'Δήμος Αντιπάρου' };
        expect(checkAgendaIdentity(antiparos, [inAgenda({ municipality: 'ΔΗΜΟΣ ΠΑΡΟΥ' })], cities).refusal).toBe('the agenda is from ΔΗΜΟΣ ΠΑΡΟΥ, not Δήμος Αντιπάρου');
    });

    it('reports an agenda whose meetings are all of another body, without refusing it', () => {
        // Άργος jul14_2026: a committee agenda read as the council's, from «αίθουσα Δημοτικού Συμβουλίου».
        expect(checkAgendaIdentity(ours, [inAgenda({ bodyName: 'Δημοτικό Συμβούλιο', ofThisBody: false })], cities)).toEqual({
            refusal: null,
            differences: ["body: the agenda calls Δημοτικό Συμβούλιο, not this meeting's body"],
        });
        expect(checkAgendaIdentity(ours, [inAgenda({ bodyName: null, ofThisBody: null })], cities).differences).toEqual([]);
    });

    it('reports a different date or time without refusing: our record is as often the wrong one', () => {
        expect(checkAgendaIdentity(ours, [inAgenda({ date: '2026-10-01', time: '19:00' })], cities)).toEqual({
            refusal: null,
            differences: ['date: recorded 2026-09-30, invitation says 2026-10-01', 'time: recorded 20:00, invitation says 19:00'],
        });
    });

    it('proves nothing from what the agenda does not print', () => {
        expect(checkAgendaIdentity(ours, [inAgenda({ municipality: null, bodyName: null, ofThisBody: null, date: null, time: null })], cities))
            .toEqual({ refusal: null, differences: [] });
    });
});

describe('holdsAnotherMeeting', () => {
    const at = (hour: number) => new Date(`2026-02-25T${String(hour).padStart(2, '0')}:00:00Z`);
    const row = (overrides: Partial<SiblingCandidate> = {}): SiblingCandidate => ({
        id: 'feb25_2026', agendaUrl: 'https://example.org/feb25.pdf', dateTime: at(17),
        scheduleStatus: 'scheduled', continuationOfId: null, postponedFromId: null, ...overrides,
    });
    const ours = row();

    it('counts a record of the same body from the same agenda or the same day', () => {
        expect(holdsAnotherMeeting(ours, row({ id: 'feb25_2_2026', agendaUrl: null, dateTime: at(18) }))).toBe(true);
        expect(holdsAnotherMeeting(ours, row({ id: 'feb26_2026', dateTime: new Date('2026-02-27T17:00:00Z') }))).toBe(true);
        expect(holdsAnotherMeeting(ours, row({ id: 'mar4_2026', agendaUrl: null, dateTime: new Date('2026-03-04T17:00:00Z') }))).toBe(false);
    });

    it('does not count a record of the same meeting (#856 review)', () => {
        // The meeting this one was postponed from, the one postponed to it, a later part, a cancelled record.
        expect(holdsAnotherMeeting(row({ postponedFromId: 'feb18_2026' }), row({ id: 'feb18_2026', scheduleStatus: 'postponed' }))).toBe(false);
        expect(holdsAnotherMeeting(row({ postponedFromId: 'feb18_2026' }), row({ id: 'feb18_2026' }))).toBe(false);
        expect(holdsAnotherMeeting(ours, row({ id: 'feb26_2026', postponedFromId: 'feb25_2026' }))).toBe(false);
        expect(holdsAnotherMeeting(ours, row({ id: 'feb26_2026', continuationOfId: 'feb25_2026' }))).toBe(false);
        expect(holdsAnotherMeeting(row({ id: 'feb26_2026', continuationOfId: 'feb25_2026' }), ours)).toBe(false);
        expect(holdsAnotherMeeting(ours, row({ id: 'feb25_2_2026', scheduleStatus: 'cancelled' }))).toBe(false);
    });
});
