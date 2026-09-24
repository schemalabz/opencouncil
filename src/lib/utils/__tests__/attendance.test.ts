import { splitAttendance } from '@/lib/utils/attendance';

describe('splitAttendance', () => {
    const rows = [
        { personId: 'mayor', status: 'PRESENT' as const },
        { personId: 'a', status: 'PRESENT' as const },
        { personId: 'b', status: 'ABSENT' as const },
    ];

    it('drops the mayor and splits by status', () => {
        const { present, absent } = splitAttendance(rows, 'mayor');
        expect(present.map(r => r.personId)).toEqual(['a']);
        expect(absent.map(r => r.personId)).toEqual(['b']);
    });

    it('keeps every member when there is no mayor', () => {
        expect(splitAttendance(rows, null).present.map(r => r.personId)).toEqual(['mayor', 'a']);
    });

    it('puts every row in exactly one side', () => {
        const { present, absent } = splitAttendance(rows, null);
        expect(present.length + absent.length).toBe(rows.length);
    });
});
