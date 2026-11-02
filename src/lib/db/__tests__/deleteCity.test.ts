/** @jest-environment node */
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { city: { delete: jest.fn() } } }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), getCurrentUser: jest.fn(), getAdminRealms: jest.fn() }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn() }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn() }));
jest.mock('@/lib/db/citiesAdmin', () => ({ CITY_COUNT_SELECT: {}, CITY_ORDER_BY: [], createCityDirect: jest.fn(), updateCityGeometryDirect: jest.fn() }));

import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getCityRealm } from '@/lib/db/cityRealm';
import { deleteCity } from '@/lib/db/cities';
import { ForbiddenError } from '@/lib/api/errors';

beforeEach(() => jest.clearAllMocks());

/** The delete cascades to the whole city, so it is the realm's admin's (#875). */
describe('deleteCity', () => {
    it('asks for the admin right on the realm of the city', async () => {
        (getCityRealm as jest.Mock).mockResolvedValue('greece');
        await deleteCity('athens');
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({ realm: 'greece' });
        expect(prisma.city.delete).toHaveBeenCalledWith({ where: { id: 'athens' } });
    });

    it('deletes nothing when the right is refused', async () => {
        (getCityRealm as jest.Mock).mockResolvedValue('greece');
        (withUserAuthorizedToEdit as jest.Mock).mockRejectedValue(new ForbiddenError());
        await expect(deleteCity('athens')).rejects.toThrow(ForbiddenError);
        expect(prisma.city.delete).not.toHaveBeenCalled();
    });

    it('leaves an unknown city to a superadmin', async () => {
        (getCityRealm as jest.Mock).mockResolvedValue(null);
        (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(true);
        await deleteCity('atlantis');
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({});
    });
});
