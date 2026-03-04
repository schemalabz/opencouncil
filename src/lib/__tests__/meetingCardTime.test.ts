/** @jest-environment node */
import { getMeetingCardTemporalState } from '../meetingCardTime';

describe('getMeetingCardTemporalState', () => {
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

  it('uses city timezone for isToday comparison when provided', () => {
    const result = getMeetingCardTemporalState({
      // 01:00 on Feb 25 in Athens, but 23:00 on Feb 24 in UTC
      meetingDate: new Date('2026-02-24T23:00:00Z'),
      meetingHasVideo: false,
      // 03:00 on Feb 25 in Athens, but still Feb 25 in UTC too
      referenceNow: new Date('2026-02-25T01:00:00Z'),
      locale: 'en',
      cityTimezone: 'Europe/Athens'
    });

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
