const mockFindUnique = jest.fn();
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { city: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } } }));

import { getCityTimezone } from '@/lib/db/cityTimezone';
import { DEFAULT_TIMEZONE } from '@/lib/formatters/time';

describe('getCityTimezone', () => {
    it('reads the time zone of the city', async () => {
        mockFindUnique.mockResolvedValue({ timezone: 'Europe/Belgrade' });
        await expect(getCityTimezone('belgrade')).resolves.toBe('Europe/Belgrade');
    });

    it('reads DEFAULT_TIMEZONE for a city that does not exist', async () => {
        mockFindUnique.mockResolvedValue(null);
        await expect(getCityTimezone('nowhere')).resolves.toBe(DEFAULT_TIMEZONE);
    });
});
