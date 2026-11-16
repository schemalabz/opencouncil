/** @jest-environment node */
// The session-gated writers of cities.ts wrap every failure as a plain 500,
// except a refusal of the API: the form shows a 409 and a 404 to the editor.
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../../cache', () => ({ createCache: jest.fn() }));
jest.mock('../../realm.server', () => ({ getRealm: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('../citiesAdmin', () => ({
    CITY_COUNT_SELECT: {}, CITY_ORDER_BY: [],
    createCityDirect: jest.fn(), editCityDirect: jest.fn(), updateCityGeometryDirect: jest.fn(), getCityWithCountsDirect: jest.fn(),
}));

import { createCity, editCity } from '../cities';
import { createCityDirect, editCityDirect } from '../citiesAdmin';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { ConflictError, NotFoundError } from '@/lib/api/errors';

const refusal = new ConflictError('Cannot publish "trikala" as a demo: realm greece already has a supported city (Athens).');

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('editCity', () => {
    it('passes the refusal of the demo rule through as it is', async () => {
        jest.mocked(editCityDirect).mockRejectedValueOnce(refusal);
        await expect(editCity('trikala', { status: 'demo' })).rejects.toBe(refusal);
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'trikala' });
    });

    it('passes a missing city through as not found', async () => {
        jest.mocked(editCityDirect).mockRejectedValueOnce(new NotFoundError('City not found'));
        await expect(editCity('gone', { status: 'demo' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('still hides any other failure behind the generic message', async () => {
        jest.mocked(editCityDirect).mockRejectedValueOnce(new Error('connection lost'));
        await expect(editCity('trikala', { name: 'x' })).rejects.toThrow('Failed to edit city');
    });
});

describe('createCity', () => {
    const data = { id: 'trikala', realm: 'greece', status: 'demo' } as Parameters<typeof createCity>[0];

    it('passes the refusal of the demo rule through as it is', async () => {
        jest.mocked(createCityDirect).mockRejectedValueOnce(refusal);
        await expect(createCity(data)).rejects.toBe(refusal);
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({});
    });

    it('still hides any other failure behind the generic message', async () => {
        jest.mocked(createCityDirect).mockRejectedValueOnce(new Error('connection lost'));
        await expect(createCity(data)).rejects.toThrow('Failed to create city');
    });
});
