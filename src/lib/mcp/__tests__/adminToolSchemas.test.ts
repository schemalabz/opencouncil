/** @jest-environment node */
// The schemas load without the write layer: no mock of Prisma, env.mjs or
// adminData is necessary here.
import { createMeetingToolInput, createTopicsToolInput, MAX_TOPICS_PER_CALL, startTaskToolInput, updateMeetingToolInput } from '@/lib/mcp/adminToolSchemas';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { createTopicSchema } from '@/lib/zod-schemas/topic';

const meeting = { cityId: 'chania' };

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

describe('create_topics and the topic form of /admin/topics', () => {
    const topic = { name: 'Housing', name_en: 'Housing', colorHex: '#c2410c', icon: 'house', description: 'Social housing.' };

    it.each([
        ['a valid topic', {}],
        ['a colour that is not a hex colour', { colorHex: 'orange' }],
        ['a name that is only spaces', { name: '   ' }],
        ['no icon', { icon: undefined }],
    ])('agree on %s', (_case, change) => {
        const rest = createTopicSchema.safeParse({ ...topic, ...change, realm: 'south_africa' }).success;
        expect(createTopicsToolInput.safeParse({ realm: 'south_africa', topics: [{ ...topic, ...change }] }).success).toBe(rest);
    });

    it('refuses two topics that share an English name, the other key the search finds a topic by', () => {
        const result = createTopicsToolInput.safeParse({ realm: 'canada', topics: [
            { ...topic, name: 'Logement', name_en: 'Housing' }, { ...topic, name: 'Habitation', name_en: 'housing ' },
        ] });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]).toMatchObject({ path: ['topics', 1, 'name'] });
    });

    it('accepts a topic whose name and English name are the same', () => {
        expect(createTopicsToolInput.safeParse({ realm: 'south_africa', topics: [topic] }).success).toBe(true);
    });

    it('refuses two topics whose names differ only in letter case or spaces', () => {
        const result = createTopicsToolInput.safeParse({ realm: 'south_africa', topics: [topic, { ...topic, name: ' housing', name_en: 'Other' }] });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]).toMatchObject({ path: ['topics', 1, 'name'] });
    });

    it('takes up to MAX_TOPICS_PER_CALL topics, and refuses an empty list, one more and an unknown realm', () => {
        expect(createTopicsToolInput.safeParse({ realm: 'south_africa', topics: [] }).success).toBe(false);
        const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...topic, name: `Topic ${i}`, name_en: `Topic ${i}` }));
        expect(createTopicsToolInput.safeParse({ realm: 'south_africa', topics: many(MAX_TOPICS_PER_CALL) }).success).toBe(true);
        expect(createTopicsToolInput.safeParse({ realm: 'south_africa', topics: many(MAX_TOPICS_PER_CALL + 1) }).success).toBe(false);
        expect(createTopicsToolInput.safeParse({ realm: 'atlantis', topics: [topic] }).success).toBe(false);
    });
});

describe('start_task', () => {
    it('takes fast on transcribe only', () => {
        const base = { cityId: 'chania', meetingId: 'm1' };
        expect(startTaskToolInput.safeParse({ ...base, type: 'transcribe', fast: true }).success).toBe(true);
        const summarize = startTaskToolInput.safeParse({ ...base, type: 'summarize', fast: true });
        expect(summarize.success).toBe(false);
        expect(summarize.error?.issues[0]).toMatchObject({ path: ['fast'], message: 'fast applies to transcribe only' });
    });
});
