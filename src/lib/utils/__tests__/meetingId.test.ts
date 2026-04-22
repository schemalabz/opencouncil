import { formatDateAsMeetingId } from '../meetingId';

describe('formatDateAsMeetingId', () => {
  it('formats a standard date', () => {
    // April 20, 2026 at noon Athens time
    const date = new Date('2026-04-20T12:00:00+03:00');
    expect(formatDateAsMeetingId(date)).toBe('apr20_2026');
  });

  it('formats a single-digit day', () => {
    const date = new Date('2026-04-05T12:00:00+03:00');
    expect(formatDateAsMeetingId(date)).toBe('apr5_2026');
  });

  it('formats December correctly', () => {
    const date = new Date('2026-12-31T12:00:00+02:00');
    expect(formatDateAsMeetingId(date)).toBe('dec31_2026');
  });

  it('uses Athens timezone — UTC midnight shifts to previous day', () => {
    // Midnight UTC on April 20 is 3:00 AM in Athens (EEST, UTC+3)
    // so this should still be April 20
    const date = new Date('2026-04-20T00:00:00Z');
    expect(formatDateAsMeetingId(date)).toBe('apr20_2026');
  });

  it('uses Athens timezone — late UTC shifts to next day', () => {
    // 10 PM UTC on April 19 is 1:00 AM April 20 in Athens (EEST, UTC+3)
    const date = new Date('2026-04-19T22:00:00Z');
    expect(formatDateAsMeetingId(date)).toBe('apr20_2026');
  });
});
