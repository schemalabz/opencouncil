import type { AttendanceStatus } from '@prisma/client';

/**
 * The council's attendance for one record set, the mayor set aside — the
 * ΔΗΜΑΡΧΟΣ line is separate.
 *
 * `status` is the Prisma enum rather than a string, so "everything that is not
 * PRESENT is absent" and "only ABSENT is absent" cannot drift apart: the two
 * readings agree only because the enum has exactly these two members, and the
 * type is what keeps that true.
 */
export function splitAttendance<T extends { personId: string; status: AttendanceStatus }>(
    attendance: T[],
    mayorPersonId: string | null,
): { present: T[]; absent: T[] } {
    const filtered = attendance.filter(a => a.personId !== mayorPersonId);
    return {
        present: filtered.filter(a => a.status === 'PRESENT'),
        absent: filtered.filter(a => a.status === 'ABSENT'),
    };
}
