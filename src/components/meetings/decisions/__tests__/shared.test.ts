// shared.tsx pulls in next-intl (for MeetingAttendanceSummary) and
// react-markdown (for CollapsibleMarkdown); both ship ESM-only, which ts-jest
// cannot require. Mock them so importing splitAttendance does not need a
// bundler-level ESM transform.
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: () => null,
}));

import { splitAttendance, opensOutOfAgendaSection } from '../shared';

describe('splitAttendance', () => {
    const rows = [
        { personId: 'mayor', status: 'PRESENT' },
        { personId: 'a', status: 'PRESENT' },
        { personId: 'b', status: 'ABSENT' },
        { personId: 'c', status: 'UNKNOWN' },
    ];
    it('drops the mayor and splits by status', () => {
        const { present, absent } = splitAttendance(rows, 'mayor');
        expect(present.map(r => r.personId)).toEqual(['a']);
        expect(absent.map(r => r.personId)).toEqual(['b']);
    });
    it('keeps every member when there is no mayor', () => {
        expect(splitAttendance(rows, null).present.map(r => r.personId)).toEqual(['mayor', 'a']);
    });
});

describe('opensOutOfAgendaSection', () => {
    const agenda = { nonAgendaReason: null };
    const ooa = { nonAgendaReason: 'outOfAgenda' };

    it('opens the section on the first out-of-agenda row', () => {
        expect(opensOutOfAgendaSection([agenda, ooa, ooa], 1, true)).toBe(true);
    });
    it('does not reopen it on a later out-of-agenda row', () => {
        expect(opensOutOfAgendaSection([agenda, ooa, ooa], 2, true)).toBe(false);
    });
    it('never opens it on an agenda row', () => {
        expect(opensOutOfAgendaSection([agenda, ooa, ooa], 0, true)).toBe(false);
    });
    it('opens it on an out-of-agenda row at index 0', () => {
        expect(opensOutOfAgendaSection([ooa], 0, true)).toBe(true);
    });
    it('never opens it when section labels are off', () => {
        expect(opensOutOfAgendaSection([ooa], 0, false)).toBe(false);
    });
});
