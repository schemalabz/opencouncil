/** @jest-environment node */
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import { applyCityUpdateDirect, assertDemoAllowed, assertDemoChangeAllowed, createCityDirect, editCityDirect } from '../citiesAdmin';

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockQueryRaw = jest.fn();
// Built inside the factory: jest hoists it above every `const` of this file,
// and the mock functions are only read when a method is called.
jest.mock('../prisma', () => {
    const db = {
        city: {
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            create: (...args: unknown[]) => mockCreate(...args),
        },
        $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
        $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    };
    return { __esModule: true, default: db };
});

beforeEach(() => jest.clearAllMocks());

describe('assertDemoAllowed', () => {
    it('refuses a realm that already has a supported city, and names it', async () => {
        mockFindFirst.mockResolvedValue({ id: 'athens', name_en: 'Athens', status: 'supported' });
        const refusal = assertDemoAllowed({ realm: 'greece', exceptCityId: 'trikala' });
        await expect(refusal).rejects.toBeInstanceOf(ConflictError);
        await expect(refusal).rejects.toThrow('realm greece already has a supported city (Athens)');
        await expect(refusal).rejects.toThrow('"trikala"');
    });

    it('allows a realm with no supported city, however many demos it has', async () => {
        // The query asks for supported cities only, so other demos never come back.
        mockFindFirst.mockResolvedValue(null);
        await expect(assertDemoAllowed({ realm: 'france', exceptCityId: 'lyon' })).resolves.toBeUndefined();
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: 'supported', realm: 'france', id: { not: 'lyon' } },
        }));
    });

    it('needs no existing city, for a city that is created as a demo', async () => {
        mockFindFirst.mockResolvedValue({ id: 'athens', name_en: 'Athens' });
        await expect(assertDemoAllowed({ realm: 'greece' })).rejects.toThrow('Cannot publish the city as a demo');
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { status: 'supported', realm: 'greece' },
        }));
    });
});

describe('assertDemoChangeAllowed', () => {
    const current = (status: string, realm = 'greece') => mockFindUnique.mockResolvedValueOnce({ status, realm });

    it('checks the realm when a pending city becomes a demo', async () => {
        current('pending');
        mockFindFirst.mockResolvedValue(null);
        await expect(assertDemoChangeAllowed('athens', { status: 'demo' })).resolves.toBeUndefined();
        expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'athens' }, select: { status: true, realm: true } });
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ realm: 'greece', id: { not: 'athens' } }) }));
    });

    it('passes the refusal through', async () => {
        current('pending');
        mockFindFirst.mockResolvedValue({ id: 'chania', name_en: 'Chania' });
        await expect(assertDemoChangeAllowed('athens', { status: 'demo' })).rejects.toBeInstanceOf(ConflictError);
    });

    it('lets an existing demo save its other fields without consulting the realm', async () => {
        current('demo');
        await expect(assertDemoChangeAllowed('athens', { status: 'demo', realm: 'greece' })).resolves.toBeUndefined();
        expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('checks the new realm when a demo moves, with or without a status field', async () => {
        mockFindFirst.mockResolvedValue(null);
        current('demo', 'france');
        await assertDemoChangeAllowed('lyon', { status: 'demo', realm: 'greece' });
        current('demo', 'france');
        await assertDemoChangeAllowed('lyon', { realm: 'greece' });
        expect(mockFindFirst).toHaveBeenCalledTimes(2);
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ realm: 'greece', id: { not: 'lyon' } }) }));
    });

    it('needs no read for a change that cannot publish', async () => {
        await assertDemoChangeAllowed('athens', { name: 'Αθήνα' } as Parameters<typeof assertDemoChangeAllowed>[1]);
        await assertDemoChangeAllowed('athens', { status: 'pending', realm: 'greece' });
        await assertDemoChangeAllowed('athens', { status: 'supported' });
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('needs no check when a pending city moves realm', async () => {
        current('pending', 'france');
        await expect(assertDemoChangeAllowed('lyon', { realm: 'greece' })).resolves.toBeUndefined();
        expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('answers not found when the city is gone', async () => {
        mockFindUnique.mockResolvedValueOnce(null);
        await expect(assertDemoChangeAllowed('gone', { status: 'demo' })).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe('editCityDirect', () => {
    it('refuses before the write when the change publishes into a realm with a supported city', async () => {
        mockFindUnique.mockResolvedValueOnce({ status: 'pending', realm: 'greece' });
        mockFindFirst.mockResolvedValue({ id: 'athens', name_en: 'Athens' });
        await expect(editCityDirect('trikala', { status: 'demo' })).rejects.toBeInstanceOf(ConflictError);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('writes when the rule allows the change', async () => {
        mockFindUnique.mockResolvedValueOnce({ status: 'pending', realm: 'germany' });
        mockFindFirst.mockResolvedValue(null);
        mockUpdate.mockResolvedValue({ id: 'mannheim', status: 'demo' });
        await expect(editCityDirect('mannheim', { status: 'demo', name: 'Mannheim' })).resolves.toMatchObject({ status: 'demo' });
        expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'mannheim' }, data: { status: 'demo', name: 'Mannheim' } });
    });
});

describe('createCityDirect', () => {
    const city = (status: 'pending' | 'demo') => ({ id: 'lyon', realm: 'france', status } as Parameters<typeof createCityDirect>[0]);

    it('checks the realm before it creates a demo', async () => {
        mockFindFirst.mockResolvedValue({ id: 'paris', name_en: 'Paris' });
        await expect(createCityDirect(city('demo'))).rejects.toBeInstanceOf(ConflictError);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'supported', realm: 'france' } }));
    });

    it('creates a pending city without the check', async () => {
        mockCreate.mockResolvedValue(city('pending'));
        await expect(createCityDirect(city('pending'))).resolves.toMatchObject({ status: 'pending' });
        expect(mockFindFirst).not.toHaveBeenCalled();
    });
});

describe('applyCityUpdateDirect with status demo', () => {
    it('refuses before writing when the realm has a supported city', async () => {
        mockQueryRaw
            .mockResolvedValueOnce([{ status: 'pending', realm: 'greece' }]) // the locked row
            .mockResolvedValueOnce([]); // the boundary summary
        mockFindFirst.mockResolvedValue({ id: 'athens', name_en: 'Athens', status: 'supported' });
        await expect(applyCityUpdateDirect('trikala', { status: 'demo' })).rejects.toBeInstanceOf(ConflictError);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('publishes when the realm has no supported city', async () => {
        mockQueryRaw
            .mockResolvedValueOnce([{ status: 'pending', realm: 'germany' }])
            .mockResolvedValueOnce([]);
        mockFindFirst.mockResolvedValue(null);
        mockUpdate.mockResolvedValue({ id: 'mannheim', status: 'demo' });
        mockFindUnique.mockResolvedValue({ id: 'mannheim', status: 'demo' });
        await expect(applyCityUpdateDirect('mannheim', { status: 'demo' })).resolves.toMatchObject({
            changed: true, before: { status: 'pending' }, after: { status: 'demo' },
        });
        expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ realm: 'germany', id: { not: 'mannheim' } }) }));
    });

    it('leaves an existing demo alone without consulting the realm', async () => {
        mockQueryRaw
            .mockResolvedValueOnce([{ status: 'demo', realm: 'germany' }])
            .mockResolvedValueOnce([]);
        mockFindUnique.mockResolvedValue({ id: 'mannheim', status: 'demo' });
        await expect(applyCityUpdateDirect('mannheim', { status: 'demo' })).resolves.toMatchObject({ changed: false });
        expect(mockFindFirst).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
