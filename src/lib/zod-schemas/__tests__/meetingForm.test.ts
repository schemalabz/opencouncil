import { meetingFormSchema } from '@/lib/zod-schemas/meeting';

const valid = {
    date: new Date('2026-01-15T00:00:00.000Z'),
    time: '18:00',
    youtubeUrl: '',
    agendaUrl: '',
    meetingId: 'jan15_2026',
    administrativeBodyId: 'none',
    processAgenda: true,
    kind: null,
    urgent: false,
    scheduleStatus: 'scheduled',
    scheduleStatusReason: '',
    sessionNumber: '',
    format: null,
    closedToPublic: false,
    place: '',
    postponedFromId: 'none',
};

const issues = (input: Record<string, unknown>) =>
    meetingFormSchema.safeParse(input).error?.issues.map(issue => [issue.path.join('.'), issue.message]) ?? [];

// The form builds on the shared meeting schema. These pin the rules and the
// messages of the form, which differ from those of the API on purpose.
describe('meeting form schema', () => {
    it('takes what the form holds and keeps the date a Date', () => {
        const parsed = meetingFormSchema.parse(valid);
        expect(parsed.date).toEqual(valid.date);
        expect(parsed.time).toBe('18:00');
        expect(parsed.processAgenda).toBe(true);
    });

    it.each([
        ['date', { date: undefined }, 'Meeting date is required.'],
        ['time', { time: undefined }, 'Meeting time is required.'],
        ['youtubeUrl', { youtubeUrl: 'javascript:alert(1)' }, 'Invalid media URL.'],
        ['agendaUrl', { agendaUrl: 'not a url' }, 'Invalid Agenda URL.'],
        ['sessionNumber', { sessionNumber: '0' }, 'The session number is 1 or more.'],
    ])('%s shows the form message', (path, change, message) => {
        expect(issues({ ...valid, ...change })).toEqual([[path, message]]);
    });

    it('refuses a session number that is not a whole number', () => {
        expect(issues({ ...valid, sessionNumber: '3a' })).toContainEqual(['sessionNumber', 'The session number is a whole number.']);
    });

    it('takes an empty meeting id: the API makes the id', () => {
        expect(issues({ ...valid, meetingId: '' })).toEqual([]);
    });

    it('holds a format that no form offers, which the request does not send back', () => {
        expect(issues({ ...valid, format: 'byCirculation' })).toEqual([]);
    });

    it('accepts an empty link', () => {
        expect(meetingFormSchema.safeParse({ ...valid, youtubeUrl: '', agendaUrl: '' }).success).toBe(true);
    });
});
