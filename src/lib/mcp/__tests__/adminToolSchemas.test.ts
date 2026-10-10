/** @jest-environment node */
// The schemas load without the write layer: no mock of Prisma, env.mjs or
// adminData is necessary here.
import { createMeetingToolInput, updateMeetingToolInput } from '@/lib/mcp/adminToolSchemas';
import { meetingSchema } from '@/lib/zod-schemas/meeting';

const meeting = { cityId: 'chania', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council' };

describe('the MCP meeting tools and the REST meeting routes', () => {
    it.each([
        '2026-10-05T18:00:00+03:00',
        '2026-10-05T18:00+03:00',
        '2026-10-05T15:00Z',
        '2026-10-05T18:00:00',
        '2026-10-05T18:00',
        '2026-02-31',
    ])('agree on the date %s', (date) => {
        const rest = meetingSchema.safeParse({ ...meeting, date }).success;
        expect(createMeetingToolInput.safeParse({ ...meeting, dateTime: date }).success).toBe(rest);
        expect(updateMeetingToolInput.safeParse({ cityId: 'chania', meetingId: 'm1', dateTime: date }).success).toBe(rest);
    });

    // A meeting has a start time. REST keeps the date-only value that it took
    // before zod 4; the tools refuse it, because the write reads it as UTC midnight.
    it('refuses a date-only value on MCP and keeps it on REST', () => {
        expect(meetingSchema.safeParse({ ...meeting, date: '2026-10-05' }).success).toBe(true);
        for (const result of [
            createMeetingToolInput.safeParse({ ...meeting, dateTime: '2026-10-05' }),
            updateMeetingToolInput.safeParse({ cityId: 'chania', meetingId: 'm1', dateTime: '2026-10-05' }),
        ]) {
            expect(result.success).toBe(false);
            expect(result.error?.issues[0]?.message)
                .toBe('dateTime needs a date, a time and a UTC offset, e.g. 2026-11-05T18:00+02:00');
        }
    });

    it.each(['javascript:alert(1)', 'ftp://example.com/a.pdf'])('both refuse the link %s', (url) => {
        expect(meetingSchema.safeParse({ ...meeting, date: '2026-10-05', youtubeUrl: url }).success).toBe(false);
        expect(createMeetingToolInput.safeParse({ ...meeting, dateTime: '2026-10-05T18:00+03:00', youtubeUrl: url }).success).toBe(false);
        expect(createMeetingToolInput.safeParse({ ...meeting, dateTime: '2026-10-05T18:00+03:00', agendaUrl: url }).success).toBe(false);
    });

    // REST takes "" for "no value", and MCP takes null on update. An empty
    // body id is no body for both.
    it('clears the body with "" on REST and with null on MCP', () => {
        expect(meetingSchema.safeParse({ ...meeting, date: '2026-10-05', administrativeBodyId: '' }).success).toBe(true);
        expect(createMeetingToolInput.safeParse({ ...meeting, dateTime: '2026-10-05T18:00+03:00', administrativeBodyId: '' }).success).toBe(false);
        expect(updateMeetingToolInput.safeParse({ cityId: 'chania', meetingId: 'm1', administrativeBodyId: null }).success).toBe(true);
    });

    it('keeps the date as text for the tool, which the write converts', () => {
        expect(createMeetingToolInput.parse({ ...meeting, dateTime: '2026-10-05T18:00+03:00' }).dateTime)
            .toBe('2026-10-05T18:00+03:00');
    });
});
