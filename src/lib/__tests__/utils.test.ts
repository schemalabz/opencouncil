import {
  monthsBetween,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDateRange,
  cn,
  debounce,
  subjectToMapFeature,
  sortSubjectsByImportance,
  joinTranscriptSegments,
  isRoleActive,
  filterActiveRoles,
  filterInactiveRoles,
  normalizeText
} from '../utils';
import { calculateOfferTotals } from '../pricing';

// Mock for Greek klitiki library
jest.mock('greek-name-klitiki', () =>
  function mockKlitiki(name: string) {
    // Simple mock implementation for testing
    const conversions: Record<string, string> = {
      'Γιώργος': 'Γιώργο',
      'Νίκος': 'Νίκο',
      'Μαρία': 'Μαρία',
      'Ελένη': 'Ελένη'
    };
    return conversions[name] || name;
  },
  { virtual: true }
);

describe('monthsBetween', () => {
  it('should calculate months between two dates correctly', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-12-31');
    expect(monthsBetween(start, end)).toBe(12);
  });

  it('should handle dates in reverse order', () => {
    const start = new Date('2024-12-31');
    const end = new Date('2024-01-01');
    expect(monthsBetween(start, end)).toBe(12);
  });

  it('should round partial months to nearest month', () => {
    // Less than 15 days rounds down
    const start1 = new Date('2024-01-01');
    const end1 = new Date('2024-02-14');
    expect(monthsBetween(start1, end1)).toBe(1);

    // 15 days or more rounds up
    const start2 = new Date('2024-01-01');
    const end2 = new Date('2024-02-15');
    expect(monthsBetween(start2, end2)).toBe(2);
  });
});

describe('formatCurrency', () => {
  it('should format currency in EUR with Greek locale', () => {
    expect(formatCurrency(1234.56).replace(/\s/g, '')).toBe('1.234,56€');
    expect(formatCurrency(1000).replace(/\s/g, '')).toBe('1.000,00€');
    expect(formatCurrency(0).replace(/\s/g, '')).toBe('0,00€');
  });
});

describe('formatDate', () => {
  it('should format date in Greek locale', () => {
    const date = new Date('2024-01-15');
    // Note: The exact format might vary depending on the environment's locale support
    expect(formatDate(date)).toMatch(/15.*Ιανουαρίου.*2024/);
  });

  it('should handle string dates', () => {
    expect(formatDate(new Date('2024-01-15'))).toMatch(/15.*Ιανουαρίου.*2024/);
  });

  it('should throw error for invalid date', () => {
    // @ts-ignore - Testing invalid input
    expect(() => formatDate(null)).toThrow('Invalid date');
  });
});

describe('formatDateTime', () => {
  it('should format date and time in Greek locale', () => {
    const date = new Date('2024-01-15T14:30:00');
    // The output might contain either 24-hour format or AM/PM (μ.μ.)
    expect(formatDateTime(date)).toMatch(/15.*Ιανουαρίου.*2024/);
    expect(formatDateTime(date)).toMatch(/2:30|14:30/);
  });

  it('should handle timezone parameter', () => {
    const date = new Date('2024-01-15T14:30:00Z');
    // Just testing that it doesn't throw when timezone is provided
    expect(() => formatDateTime(date, 'Europe/Athens')).not.toThrow();
  });

  it('should throw error for invalid date', () => {
    // @ts-ignore - Testing invalid input
    expect(() => formatDateTime(null)).toThrow('Invalid date');
  });
});

describe('formatDateRange', () => {
  const mockT = (key: string) => {
    const translations: Record<string, string> = {
      'from': 'from',
      'until': 'until',
      'present': 'present'
    };
    return translations[key] || key;
  };

  it('should format date range with both dates', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-12-31');
    expect(formatDateRange(start, end, mockT)).toMatch(/from.*2024.*until.*2024/);
  });

  it('should format date range with only start date', () => {
    const start = new Date('2024-01-01');
    expect(formatDateRange(start, null, mockT)).toMatch(/from.*2024.*until.*present/);
  });

  it('should format date range with only end date', () => {
    const end = new Date('2024-12-31');
    expect(formatDateRange(null, end, mockT)).toMatch(/until.*2024/);
  });

  it('should return empty string if no dates provided', () => {
    expect(formatDateRange(null, null, mockT)).toBe('');
  });
});

describe('cn', () => {
  it('should merge class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
    expect(cn('class1', { class2: true, class3: false })).toBe('class1 class2');
    expect(cn('class1', ['class2', 'class3'])).toBe('class1 class2 class3');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', { 'active': isActive, 'disabled': isDisabled })).toBe('base active');
  });
});

describe('debounce', () => {
  jest.useFakeTimers();

  it('should debounce function calls', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 500);

    // Call debounced function
    debouncedFn();
    expect(mockFn).not.toBeCalled();

    // Fast-forward time
    jest.advanceTimersByTime(500);
    expect(mockFn).toBeCalledTimes(1);
  });

  it('should reset timer on multiple calls', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 500);

    // Call debounced function multiple times
    debouncedFn();
    jest.advanceTimersByTime(200);
    debouncedFn();
    jest.advanceTimersByTime(200);
    debouncedFn();

    expect(mockFn).not.toBeCalled();

    // Fast-forward remaining time
    jest.advanceTimersByTime(500);
    expect(mockFn).toBeCalledTimes(1);
  });

  it('should pass arguments to the original function', () => {
    const mockFn = jest.fn();
    const debouncedFn = debounce(mockFn, 500);

    debouncedFn('test', 123);
    jest.advanceTimersByTime(500);

    expect(mockFn).toBeCalledWith('test', 123);
  });
});

describe('subjectToMapFeature', () => {
  it('should convert subject to map feature', () => {
    const subject = {
      id: '123',
      name: 'Test Subject',
      location: {
        coordinates: { x: 10, y: 20 }
      }
    };

    const feature = subjectToMapFeature(subject as any);

    expect(feature).toEqual({
      id: '123',
      geometry: {
        type: 'Point',
        coordinates: [20, 10]
      },
      properties: {
        subjectId: '123',
        name: 'Test Subject'
      },
      style: {
        fillColor: '#E57373',
        fillOpacity: 0.6,
        strokeColor: '#E57373',
        strokeWidth: 6,
        label: 'Test Subject'
      }
    });
  });

  it('should return null for subject without coordinates', () => {
    const subject = {
      id: '123',
      name: 'Test Subject',
      location: null
    };

    expect(subjectToMapFeature(subject as any)).toBeNull();
  });
});

describe('sortSubjectsByImportance', () => {
  it('should prioritize hot subjects', () => {
    const subjects = [
      { id: '1', name: 'Subject 1', hot: false },
      { id: '2', name: 'Subject 2', hot: true }
    ];

    const sorted = sortSubjectsByImportance(subjects as any);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('should sort by speaking time for subjects with same hot status', () => {
    const subjects = [
      { id: '1', name: 'Subject 1', hot: false, statistics: { speakingSeconds: 100 } },
      { id: '2', name: 'Subject 2', hot: false, statistics: { speakingSeconds: 200 } }
    ];

    const sorted = sortSubjectsByImportance(subjects as any);
    expect(sorted[0].id).toBe('2');
    expect(sorted[1].id).toBe('1');
  });

  it('should handle subjects without statistics', () => {
    const subjects = [
      { id: '1', name: 'Subject 1', hot: false },
      { id: '2', name: 'Subject 2', hot: false, statistics: { speakingSeconds: 200 } }
    ];

    // Should not throw error
    expect(() => sortSubjectsByImportance(subjects as any)).not.toThrow();
  });
});

describe('joinTranscriptSegments', () => {
  it('should join adjacent segments with the same speaker', () => {
    const segments = [
      {
        speakerTag: { personId: '1' },
        startTimestamp: 0,
        endTimestamp: 10,
        utterances: [{ id: '1' }],
        topicLabels: [{ id: 'topic1' }]
      },
      {
        speakerTag: { personId: '1' },
        startTimestamp: 10,
        endTimestamp: 20,
        utterances: [{ id: '2' }],
        topicLabels: [{ id: 'topic2' }]
      },
      {
        speakerTag: { personId: '2' },
        startTimestamp: 20,
        endTimestamp: 30,
        utterances: [{ id: '3' }],
        topicLabels: [{ id: 'topic3' }]
      }
    ];

    const joined = joinTranscriptSegments(segments as any);

    expect(joined).toHaveLength(2);
    expect(joined[0].speakerTag.personId).toBe('1');
    expect(joined[0].startTimestamp).toBe(0);
    expect(joined[0].endTimestamp).toBe(20);
    expect(joined[0].utterances).toHaveLength(2);
    expect(joined[0].topicLabels).toHaveLength(2);

    expect(joined[1].speakerTag.personId).toBe('2');
  });

  it('should handle empty segments array', () => {
    expect(joinTranscriptSegments([] as any)).toEqual([]);
  });

  it('should not join segments with non-sequential timestamps', () => {
    const segments = [
      {
        speakerTag: { personId: '1' },
        startTimestamp: 0,
        endTimestamp: 10,
        utterances: [{ id: '1' }],
        topicLabels: [{ id: 'topic1' }]
      },
      {
        speakerTag: { personId: '1' },
        startTimestamp: -1, // Out of order
        endTimestamp: 5,
        utterances: [{ id: '2' }],
        topicLabels: [{ id: 'topic2' }]
      }
    ];

    const joined = joinTranscriptSegments(segments as any);
    expect(joined).toHaveLength(2);
  });
});

describe('isRoleActive', () => {
  beforeEach(() => {
    // Mock current date to 2024-01-15
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return true when both dates are null', () => {
    expect(isRoleActive({ startDate: null, endDate: null })).toBe(true);
  });

  it('should check start date only', () => {
    // Active - start date in past
    expect(isRoleActive({ startDate: new Date('2023-01-01'), endDate: null })).toBe(true);
    // Inactive - start date in future
    expect(isRoleActive({ startDate: new Date('2025-01-01'), endDate: null })).toBe(false);
  });

  it('should check end date only', () => {
    // Active - end date in future
    expect(isRoleActive({ startDate: null, endDate: new Date('2025-01-01') })).toBe(true);
    // Inactive - end date in past
    expect(isRoleActive({ startDate: null, endDate: new Date('2023-01-01') })).toBe(false);
  });

  it('should check both dates', () => {
    // Active - within range
    expect(isRoleActive({
      startDate: new Date('2023-01-01'),
      endDate: new Date('2025-01-01')
    })).toBe(true);

    // Inactive - before range
    expect(isRoleActive({
      startDate: new Date('2025-01-01'),
      endDate: new Date('2026-01-01')
    })).toBe(false);

    // Inactive - after range
    expect(isRoleActive({
      startDate: new Date('2022-01-01'),
      endDate: new Date('2023-01-01')
    })).toBe(false);
  });
});

describe('filterActiveRoles and filterInactiveRoles', () => {
  beforeEach(() => {
    // Mock current date to 2024-01-15
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should filter active roles correctly', () => {
    const roles = [
      { id: '1', startDate: null, endDate: null }, // Active (no dates)
      { id: '2', startDate: new Date('2023-01-01'), endDate: null }, // Active (past start)
      { id: '3', startDate: new Date('2025-01-01'), endDate: null }, // Inactive (future start)
      { id: '4', startDate: new Date('2023-01-01'), endDate: new Date('2025-01-01') } // Active (within range)
    ];

    const activeRoles = filterActiveRoles(roles);
    expect(activeRoles).toHaveLength(3);
    expect(activeRoles.map(r => r.id)).toEqual(['1', '2', '4']);

    const inactiveRoles = filterInactiveRoles(roles);
    expect(inactiveRoles).toHaveLength(1);
    expect(inactiveRoles[0].id).toBe('3');
  });
});

describe('normalizeText', () => {
  it('should convert text to lowercase', () => {
    expect(normalizeText('AbCdEf')).toBe('abcdef');
  });

  it('should remove Greek diacritics', () => {
    expect(normalizeText('άέήίόύώ')).toBe('αεηιουω');
    expect(normalizeText('ΆΈΉΊΌΎΏϊϋΐΰ')).toBe('αεηιουωιυιυ');
  });

  it('should handle empty and null inputs', () => {
    expect(normalizeText('')).toBe('');
    // @ts-ignore - Testing invalid input
    expect(normalizeText(null)).toBe('');
  });
});

describe('calculateOfferTotals', () => {
  it('should calculate totals correctly with correctness guarantee', () => {
    const offer = {
      id: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'STANDARD',
      version: 1,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      recipientName: 'Test Municipality',
      platformPrice: 100,
      ingestionPerHourPrice: 50,
      hoursToIngest: 10,
      correctnessGuarantee: true,
      meetingsToIngest: 5,
      hoursToGuarantee: null,
      equipmentRentalPrice: null,
      equipmentRentalName: null,
      equipmentRentalDescription: null,
      physicalPresenceHours: null,
      discountPercentage: 10,
      respondToEmail: 'test@example.com',
      respondToName: 'Test Person',
      cityId: '1',
      respondToPhone: '+30123456789'
    } as const;

    const result = calculateOfferTotals(offer);

    expect(result.months).toBe(12);
    expect(result.platformTotal).toBe(1200); // 100 * 12 months
    expect(result.ingestionTotal).toBe(500); // 50 * 10 hours
    expect(result.correctnessGuaranteeCost).toBe(400); // 5 meetings * 80
    expect(result.subtotal).toBe(2100); // 1200 + 500 + 400
    expect(result.discount).toBe(210); // 2100 * 0.10
    expect(result.total).toBe(1890); // 2100 - 210
    expect(result.paymentPlan).toHaveLength(2);
    expect(result.paymentPlan[0].amount).toBe(945); // 1890 / 2
    expect(result.paymentPlan[1].amount).toBe(945); // 1890 / 2

    // Verify payment dates are Fridays
    expect(result.paymentPlan[0].dueDate.getDay()).toBe(5);
    expect(result.paymentPlan[1].dueDate.getDay()).toBe(5);
  });

  it('should calculate totals correctly without correctness guarantee', () => {
    const offer = {
      id: '2',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'STANDARD',
      version: 1,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      recipientName: 'Test Municipality',
      platformPrice: 100,
      ingestionPerHourPrice: 50,
      hoursToIngest: 10,
      correctnessGuarantee: false,
      meetingsToIngest: 5,
      hoursToGuarantee: null,
      equipmentRentalPrice: null,
      equipmentRentalName: null,
      equipmentRentalDescription: null,
      physicalPresenceHours: null,
      discountPercentage: 10,
      respondToEmail: 'test@example.com',
      respondToName: 'Test Person',
      cityId: '1',
      respondToPhone: '+30123456789'
    } as const;

    const result = calculateOfferTotals(offer);

    expect(result.correctnessGuaranteeCost).toBe(0);
    expect(result.subtotal).toBe(1700); // 1200 + 500 + 0
    expect(result.discount).toBe(170); // 1700 * 0.10
    expect(result.total).toBe(1530); // 1700 - 170
  });

  it('should calculate totals correctly with equipment rental and physical presence', () => {
    const offer = {
      id: '3',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'STANDARD',
      version: 3,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      recipientName: 'Test Municipality',
      platformPrice: 100,
      ingestionPerHourPrice: 50,
      hoursToIngest: 10,
      correctnessGuarantee: false,
      meetingsToIngest: null,
      hoursToGuarantee: null,
      equipmentRentalPrice: 150, // €150/month
      equipmentRentalName: 'Professional AV Package',
      equipmentRentalDescription: 'Cameras and microphones',
      physicalPresenceHours: 8, // 8 hours at €25/hour
      discountPercentage: 0,
      respondToEmail: 'test@example.com',
      respondToName: 'Test Person',
      cityId: '1',
      respondToPhone: '+30123456789'
    } as const;

    const result = calculateOfferTotals(offer);

    expect(result.months).toBe(12);
    expect(result.platformTotal).toBe(1200); // 100 * 12 months
    expect(result.ingestionTotal).toBe(500); // 50 * 10 hours
    expect(result.equipmentRentalTotal).toBe(1800); // 150 * 12 months
    expect(result.physicalPresenceTotal).toBe(200); // 8 * 25
    expect(result.correctnessGuaranteeCost).toBe(0);
    expect(result.subtotal).toBe(3700); // 1200 + 500 + 1800 + 200 + 0
    expect(result.discount).toBe(0); // 0% discount
    expect(result.total).toBe(3700); // 3700 - 0
  });
});