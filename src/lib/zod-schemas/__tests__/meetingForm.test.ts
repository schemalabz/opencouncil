import { meetingFormSchema } from '@/lib/zod-schemas/meeting';

const valid = {
    name: 'Δημοτικό Συμβούλιο',
    name_en: 'City Council',
    date: new Date('2026-01-15T00:00:00.000Z'),
    time: '18:00',
    youtubeUrl: '',
    agendaUrl: '',
    meetingId: 'jan15_2026',
    administrativeBodyId: 'none',
    processAgenda: true,
    kind: null,
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
        ['name', { name: 'A' }, 'Meeting name must be at least 2 characters.'],
        ['name_en', { name_en: 'A' }, 'Meeting name (English) must be at least 2 characters.'],
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

    it('takes an empty meeting id and an empty name: the API makes the id and derives the name', () => {
        expect(issues({ ...valid, meetingId: '', name: '', name_en: '' })).toEqual([]);
    });

    it('holds a format that no form offers, which the request does not send back', () => {
        expect(issues({ ...valid, format: 'byCirculation' })).toEqual([]);
    });

    it('accepts an empty link', () => {
        expect(meetingFormSchema.safeParse({ ...valid, youtubeUrl: '', agendaUrl: '' }).success).toBe(true);
    });
});
