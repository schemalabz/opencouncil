import { meetingSchema } from '../meeting';

const validBase = {
  name: 'Δημοτικό Συμβούλιο',
  name_en: 'City Council',
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

  it('rejects names shorter than 2 characters', () => {
    expect(() => meetingSchema.parse({ ...validBase, name: 'A' })).toThrow();
    expect(() => meetingSchema.parse({ ...validBase, name_en: 'A' })).toThrow();
  });

  it('treats the names as an optional override', () => {
    const { name: _name, name_en: _nameEn, ...noNames } = validBase;
    const omitted = meetingSchema.parse(noNames);
    expect(omitted.name).toBeUndefined();
    expect(omitted.name_en).toBeUndefined();

    expect(meetingSchema.parse({ ...validBase, name: '', name_en: '  ' })).toMatchObject({ name: null, name_en: null });
    expect(meetingSchema.parse({ ...validBase, name: null })).toMatchObject({ name: null });
  });
});
