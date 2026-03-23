/** @jest-environment node */
import { getMeetingCardTemporalState } from '../meetingCardTime';

describe('getMeetingCardTemporalState', () => {
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns deterministic output when referenceNow is fixed', () => {
    const meetingDate = new Date('2026-02-24T13:00:00Z');
    const referenceNow = new Date('2026-02-24T12:00:00Z');

    jest.setSystemTime(new Date('2026-02-24T12:00:00Z'));
    const first = getMeetingCardTemporalState({
      meetingDate,
      meetingHasVideo: false,
      referenceNow,
      locale: 'en'
    });

    jest.setSystemTime(new Date('2026-02-24T12:15:00Z'));
    const second = getMeetingCardTemporalState({
      meetingDate,
      meetingHasVideo: false,
      referenceNow,
      locale: 'en'
    });

    expect(second).toEqual(first);
  });

  it('marks meeting as today without video when same day and no video', () => {
    const result = getMeetingCardTemporalState({
      meetingDate: new Date('2026-02-24T18:00:00Z'),
      meetingHasVideo: false,
      referenceNow: new Date('2026-02-24T12:00:00Z'),
      locale: 'en'
    });

    expect(result.isToday).toBe(true);
    expect(result.isTodayWithoutVideo).toBe(true);
    expect(result.isUpcoming).toBe(true);
  });

  it('does not show upcoming distance for past meetings', () => {
    const result = getMeetingCardTemporalState({
      meetingDate: new Date('2026-02-24T10:00:00Z'),
      meetingHasVideo: true,
      referenceNow: new Date('2026-02-24T12:00:00Z'),
      locale: 'en'
    });

    expect(result.isUpcoming).toBe(false);
    expect(result.upcomingDistance).toBeNull();
  });

  it('uses city timezone for isToday comparison when cross-midnight UTC', () => {
    const result = getMeetingCardTemporalState({
      // 00:30 on Feb 25 in Athens, but 22:30 on Feb 24 in UTC
      meetingDate: new Date('2026-02-24T22:30:00Z'),
      meetingHasVideo: false,
      // 01:00 on Feb 25 in Athens, but still 23:00 on Feb 24 in UTC
      referenceNow: new Date('2026-02-24T23:00:00Z'),
      locale: 'en',
      cityTimezone: 'Europe/Athens'
    });

    // Both are Feb 25 in Athens, even though both are Feb 24 in UTC
    expect(result.isToday).toBe(true);
  });

  it('correctly identifies today when crossing midnight in UTC but same day in local timezone', () => {
    const result = getMeetingCardTemporalState({
      // 2024-03-24 01:30 Athens (UTC+2)
      meetingDate: '2024-03-23T23:30:00Z',
      meetingHasVideo: false,
      // 2024-03-24 02:30 Athens (UTC+2)
      referenceNow: '2024-03-24T00:30:00Z',
      locale: 'en',
      cityTimezone: 'Europe/Athens'
    });

    // In UTC, these are different days (23rd and 24th)
    // In Athens, both are March 24th
    expect(result.isToday).toBe(true);
  });

  it('throws RangeError when meetingDate is an invalid ISO string', () => {
    expect(() => getMeetingCardTemporalState({
      meetingDate: 'invalid-date',
      meetingHasVideo: false,
      referenceNow: new Date('2026-02-24T12:00:00Z'),
      locale: 'en'
    })).toThrowError(new RangeError('Invalid date value: invalid-date'));
  });

  it('throws RangeError when referenceNow is an invalid ISO string', () => {
    expect(() => getMeetingCardTemporalState({
      meetingDate: new Date('2026-02-24T12:00:00Z'),
      meetingHasVideo: false,
      referenceNow: 'invalid-date',
      locale: 'en'
    })).toThrowError(new RangeError('Invalid date value: invalid-date'));
  });

  it('appends directional suffix to upcomingDistance', () => {
    const result = getMeetingCardTemporalState({
      meetingDate: new Date('2026-02-24T14:00:00Z'),
      meetingHasVideo: false,
      referenceNow: new Date('2026-02-24T12:00:00Z'),
      locale: 'en'
    });
    expect(result.upcomingDistance).toBe('in about 2 hours');
  });
});
