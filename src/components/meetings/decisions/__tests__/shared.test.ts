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

import { splitAttendance } from '../shared';

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
