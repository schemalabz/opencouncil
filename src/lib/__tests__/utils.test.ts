import { monthsBetween, formatCurrency, formatDate, calculateOfferTotals } from '../utils';

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
});

describe('calculateOfferTotals', () => {
  it('should calculate totals correctly with correctness guarantee', () => {
    const offer = {
      id: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'STANDARD',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      recipientName: 'Test Municipality',
      platformPrice: 100,
      ingestionPerHourPrice: 50,
      hoursToIngest: 10,
      correctnessGuarantee: true,
      meetingsToIngest: 5,
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
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      recipientName: 'Test Municipality',
      platformPrice: 100,
      ingestionPerHourPrice: 50,
      hoursToIngest: 10,
      correctnessGuarantee: false,
      meetingsToIngest: 5,
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
});