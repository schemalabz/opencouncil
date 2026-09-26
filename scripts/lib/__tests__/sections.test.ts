import type { DiscussionStatus } from '@prisma/client';
import { formatMeetingSections, meetingSections, type SectionsSubject, type SectionsUtterance } from '../sections';
import spartaMay6 from '@/lib/minutes/__tests__/fixtures/sparta-may6-2026-utterances.json';

const subject = (id: string, agendaItemIndex: number | null, o: Partial<SectionsSubject> = {}): SectionsSubject => ({
    id, name: `Subject ${id}`, agendaItemTitle: null, agendaItemIndex, nonAgendaReason: null, withdrawn: false, discussedIn: null, ...o,
});

let n = 0;
const utterance = (subjectId: string | null, status: DiscussionStatus | null, start: number, end = start + 1, text = `at ${start}`, speaker = 'Πρόεδρος'): SectionsUtterance => ({
    id: `u${n++}`, text, startTimestamp: start, endTimestamp: end, discussionSubjectId: subjectId, discussionStatus: status,
    speakerSegment: { speakerTag: { label: 'SPEAKER_1', personId: 'p1', person: { name_short: speaker } } },
});

describe('meetingSections', () => {
    const rows = spartaMay6 as { item: number | null; status: DiscussionStatus | null; start: number; end: number }[];
    const subjects = Array.from({ length: 14 }, (_, i) => subject(`s${i + 1}`, i + 1));
    const utterances = rows.map(r => utterance(r.item === null ? null : `s${r.item}`, r.status, r.start, r.end));
    const result = meetingSections('sparta/may6_2026', subjects, utterances);
    const item5 = result.sections.find(s => s.label === '5ο')!;

    it('prints the order line of Sparta may6_2026, item 5 last', () => {
        expect(result.order).toBe('1ο–4ο, 6ο–14ο, 5ο');
        expect(result.sections.map(s => s.label).at(-1)).toBe('5ο');
    });

    it('gives item 5 two windows, a resumed block at 715.29, and no notes', () => {
        expect(item5.windows).toHaveLength(2);
        expect(item5.resumedAt).toHaveLength(1);
        expect(item5.resumedAt[0]).toBeCloseTo(715.29, 2);
        expect(item5.discussedElsewhere).toEqual([]);
        expect(result.sections.every(s => s.discussedElsewhere.length === 0)).toBe(true);
    });

    it('assigns every utterance once', () => {
        const printed = result.preamble + result.epilogue + result.sections.reduce((sum, s) => sum + s.utterances + s.leadIn, 0);
        expect(printed).toBe(result.utterances);
    });
});

describe('formatMeetingSections', () => {
    it('prints the order note, windows, counts, notes and the first two lines', () => {
        const long = 'λ'.repeat(120);
        const subjects = [
            subject('a', 1),
            subject('b', 2, { discussedIn: { id: 'a', name: 'Subject a', agendaItemTitle: 'Title a', agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false } }),
            subject('c', 3),
            subject('w', 4, { withdrawn: true }),
        ];
        const utterances = [
            utterance('a', 'SUBJECT_DISCUSSION', 10, 11, long, 'Α. Αλφα'),
            utterance('b', 'SUBJECT_DISCUSSION', 11.5, 12),
            utterance('a', 'VOTE', 13, 14),
            utterance(null, null, 20, 21),
            utterance('c', 'SUBJECT_DISCUSSION', 30, 31),
        ];
        expect(formatMeetingSections(meetingSections('x/m', subjects, utterances))).toBe([
            'x/m: 5 utterances, preamble 0, epilogue 0',
            'Σειρά συζήτησης: ακολουθεί την ημερήσια διάταξη',
            'withdrawn: 4ο',
            '',
            '1ο «Subject a»',
            '  windows 10.0–14.0; 3 utterances',
            `  10.0 Α. Αλφα: ${'λ'.repeat(100)}…`,
            '  11.5 Πρόεδρος: at 11.5',
            '',
            '2ο «Subject b»',
            '  windows 11.5–12.0; 0 utterances',
            '  discussed with 1ο',
            '  discussed elsewhere: 1ο',
            '',
            '3ο «Subject c»',
            '  windows 30.0–31.0; 1 utterances, lead-in 1',
            '  30.0 Πρόεδρος: at 30',
            '',
        ].join('\n'));
    });

    it('prints the order line when the meeting left the agenda order', () => {
        const subjects = [subject('a', 1), subject('b', 2)];
        const utterances = [utterance('b', 'VOTE', 1), utterance('a', 'VOTE', 5)];
        expect(formatMeetingSections(meetingSections('x/m', subjects, utterances)).split('\n')[1]).toBe('Σειρά συζήτησης: 2ο, 1ο');
    });
});
