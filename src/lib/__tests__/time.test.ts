import {
  formatTime,
  formatTimestamp,
  formatDuration,
  formatDurationMs,
  formatDateRange,
} from '../formatters/time';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [1, '0:01'],
    [30, '0:30'],
    [59, '0:59'],
    [60, '1:00'],
    [61, '1:01'],
    [90, '1:30'],
    [599, '9:59'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3601, '1:00:01'],
    [3661, '1:01:01'],
    [7200, '2:00:00'],
    [86399, '23:59:59'],
  ])('formatTime(%i) → %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it('truncates fractional seconds', () => {
    expect(formatTime(61.9)).toBe('1:01');
  });
});

describe('formatTimestamp', () => {
  it.each([
    [0, '00:00:00'],
    [1, '00:00:01'],
    [61, '00:01:01'],
    [3661, '01:01:01'],
    [86399, '23:59:59'],
  ])('formatTimestamp(%i) → %s', (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });

  it.each([
    [1.5, '00:00:01.500'],
    [0, '00:00:00.000'],
    [3661.123, '01:01:01.123'],
  ])('formatTimestamp(%f, true) → %s', (input, expected) => {
    expect(formatTimestamp(input, true)).toBe(expected);
  });

  it('omits milliseconds by default', () => {
    expect(formatTimestamp(1.5)).toBe('00:00:01');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0m 0s'],
    [30, '0m 30s'],
    [60, '1m 0s'],
    [90, '1m 30s'],
    [125, '2m 5s'],
    [3600, '60m 0s'],
  ])('formatDuration(%i) → %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it('truncates fractional seconds', () => {
    expect(formatDuration(90.7)).toBe('1m 30s');
  });
});

describe('formatDurationMs', () => {
  it('returns 0m for zero', () => {
    expect(formatDurationMs(0)).toBe('0m');
  });

  it.each([
    [60_000, '1m'],
    [120_000, '2m'],
    [3_600_000, '1h'],
    [5_400_000, '1h 30m'],
    [86_400_000, '1d'],
    [90_000_000, '1d 1h'],
    [93_600_000, '1d 2h'],
    [90_060_000, '1d 1h 1m'],
  ])('formatDurationMs(%i) → %s', (input, expected) => {
    expect(formatDurationMs(input)).toBe(expected);
  });

  it('rounds to nearest minute', () => {
    // 29 seconds rounds down to 0m
    expect(formatDurationMs(29_000)).toBe('0m');
    // 31 seconds rounds up to 1m
    expect(formatDurationMs(31_000)).toBe('1m');
  });
});

describe('formatDateRange', () => {
  const mockT = (key: string) => {
    const translations: Record<string, string> = {
      from: 'from',
      until: 'until',
      present: 'present',
    };
    return translations[key] || key;
  };

  it('returns empty string when both dates are null', () => {
    expect(formatDateRange(null, null, mockT)).toBe('');
  });

  it('formats range with both dates', () => {
    const start = new Date('2024-01-15');
    const end = new Date('2024-06-15');
    const result = formatDateRange(start, end, mockT);
    expect(result).toContain('from');
    expect(result).toContain('until');
    expect(result).toContain('2024');
  });

  it('uses "present" when end date is null', () => {
    const start = new Date('2024-01-15');
    const result = formatDateRange(start, null, mockT);
    expect(result).toContain('from');
    expect(result).toContain('present');
    expect(result).toContain('2024');
  });

  it('formats with only end date', () => {
    const end = new Date('2024-06-15');
    const result = formatDateRange(null, end, mockT);
    expect(result).toContain('until');
    expect(result).not.toContain('from');
    expect(result).toContain('2024');
  });
});
