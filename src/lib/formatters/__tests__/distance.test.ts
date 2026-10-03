import { formatDistance } from '../distance';

describe('formatDistance', () => {
    it('rounds short distances to the nearest 50 m', () => {
        expect(formatDistance(412, 'en')).toBe('400 m');
        expect(formatDistance(10, 'en')).toBe('50 m');
    });

    it('switches to kilometres on the rounded value', () => {
        expect(formatDistance(980, 'en')).toBe('1 km');
        expect(formatDistance(1442, 'en')).toBe('1.4 km');
    });

    it('drops the decimal beyond ten kilometres', () => {
        expect(formatDistance(12_340, 'en')).toBe('12 km');
    });

    it('uses the locale’s decimal mark and unit', () => {
        expect(formatDistance(1050, 'el')).toBe(new Intl.NumberFormat('el-GR', { style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: 1 }).format(1.05));
        expect(formatDistance(1442, 'el')).toContain('1,4');
    });
});
