import { meetingSchema } from '../meeting';
import { MEETING_RECORD_INPUT_KEYS } from '@/lib/meetingLifecycleRules';

const validBase = {
  date: '2026-01-15T18:00:00.000Z',
};

describe('meetingSchema', () => {
  it('transforms the date string into a Date', () => {
    const parsed = meetingSchema.parse(validBase);
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.date.toISOString()).toBe('2026-01-15T18:00:00.000Z');
  });

  it('rejects an unparseable date', () => {
    expect(() => meetingSchema.parse({ ...validBase, date: 'not-a-date' })).toThrow();
  });

  it('defaults processAgenda to false when omitted', () => {
    expect(meetingSchema.parse(validBase).processAgenda).toBe(false);
  });

  it('makes meetingId optional (POST auto-generates it when omitted)', () => {
    const parsed = meetingSchema.parse(validBase);
    expect(parsed.meetingId).toBeUndefined();
  });

  it('accepts a provided meetingId but rejects an empty string', () => {
    expect(meetingSchema.parse({ ...validBase, meetingId: 'athens-2026-01-15' }).meetingId)
      .toBe('athens-2026-01-15');
    expect(() => meetingSchema.parse({ ...validBase, meetingId: '' })).toThrow();
  });

  it('accepts a valid URL or an empty string for youtubeUrl, rejects a non-URL', () => {
    expect(meetingSchema.parse({ ...validBase, youtubeUrl: 'https://youtu.be/abc' }).youtubeUrl)
      .toBe('https://youtu.be/abc');
    expect(meetingSchema.parse({ ...validBase, youtubeUrl: '' }).youtubeUrl).toBe('');
    expect(() => meetingSchema.parse({ ...validBase, youtubeUrl: 'not a url' })).toThrow();
  });

  it('drops a name that a client still sends, because the name is derived', () => {
    const parsed = meetingSchema.parse({ ...validBase, name: 'Δημοτικό Συμβούλιο', name_en: 'A' });
    expect(parsed).not.toHaveProperty('name');
    expect(parsed).not.toHaveProperty('name_en');
  });
});

describe('the fields of meetingSchema', () => {
    // Create and update both take the facts of the record through
    // MEETING_RECORD_INPUT_KEYS. A field that the schema gains must be one of
    // them, or one of the other fields that both routes pass on by name.
    const OTHER_FIELDS = [
        'date', 'youtubeUrl', 'agendaUrl', 'meetingId', 'administrativeBodyId',
        'processAgenda', 'postponedFromId', 'continuationOfId', 'municipalMinutesUrl',
    ];

    it('are the record facts and the fields that the routes pass on by name', () => {
        expect(Object.keys(meetingSchema.shape).sort()).toEqual([...MEETING_RECORD_INPUT_KEYS, ...OTHER_FIELDS].sort());
    });
});
