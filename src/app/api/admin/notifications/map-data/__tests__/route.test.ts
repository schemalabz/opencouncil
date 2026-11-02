/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ getAdminRealms: jest.fn() }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn() }));
jest.mock('@/lib/db/notifications', () => ({ getNotificationMapData: jest.fn().mockResolvedValue({ userPreferenceLocations: [] }) }));

import { GET } from '@/app/api/admin/notifications/map-data/route';
import { getAdminRealms } from '@/lib/auth';
import { getCityRealm } from '@/lib/db/cityRealm';
import { getNotificationMapData } from '@/lib/db/notifications';
import { ForbiddenError } from '@/lib/api/errors';

const request = () => new NextRequest('http://localhost/api/admin/notifications/map-data?cityId=athens&meetingId=m1');

beforeEach(() => {
    jest.clearAllMocks();
    (getCityRealm as jest.Mock).mockResolvedValue('greece');
});

describe('GET /api/admin/notifications/map-data', () => {
    it('answers a realm admin of the city', async () => {
        (getAdminRealms as jest.Mock).mockResolvedValue(['greece']);

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(getNotificationMapData).toHaveBeenCalledWith('m1', 'athens');
    });

    it('answers a superadmin', async () => {
        (getAdminRealms as jest.Mock).mockResolvedValue(null);

        expect((await GET(request())).status).toBe(200);
    });

    // The answer holds the saved locations of readers.
    it('refuses a city admin, who is no realm admin', async () => {
        (getAdminRealms as jest.Mock).mockRejectedValue(new ForbiddenError());

        const response = await GET(request());

        expect(response.status).toBe(403);
        expect(getNotificationMapData).not.toHaveBeenCalled();
    });

    it('refuses a realm admin a city of another realm, also when they admin that city', async () => {
        (getAdminRealms as jest.Mock).mockResolvedValue(['serbia']);

        const response = await GET(request());

        expect(response.status).toBe(403);
        expect(getNotificationMapData).not.toHaveBeenCalled();
    });

    it('refuses a realm admin a city that does not exist', async () => {
        (getAdminRealms as jest.Mock).mockResolvedValue(['greece']);
        (getCityRealm as jest.Mock).mockResolvedValue(null);

        expect((await GET(request())).status).toBe(403);
    });
});
