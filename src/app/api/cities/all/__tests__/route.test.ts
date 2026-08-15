/** @jest-environment node */
jest.mock('@/lib/db/cities', () => ({
    getAllCitiesMinimal: jest.fn(),
}));

import { GET } from '../route';
import { getAllCitiesMinimal } from '@/lib/db/cities';

const mockGetAllCitiesMinimal = getAllCitiesMinimal as jest.MockedFunction<typeof getAllCitiesMinimal>;

describe('GET /api/cities/all', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    // The City model no longer has officialSupport, but third-party consumers of
    // this endpoint keep the field: it must be derived per city as "is a customer".
    it('derives officialSupport on the wire: true only for supported cities', async () => {
        mockGetAllCitiesMinimal.mockResolvedValue([
            { id: 'a', status: 'supported' },
            { id: 'b', status: 'demo' },
            { id: 'c', status: 'pending' },
        ] as unknown as Awaited<ReturnType<typeof getAllCitiesMinimal>>);

        const res = await GET();
        const body = await res.json();

        expect(body.map((c: { id: string; officialSupport: boolean }) => [c.id, c.officialSupport])).toEqual([
            ['a', true],
            ['b', false],
            ['c', false],
        ]);
    });

    it('keeps status on the wire alongside the derived field', async () => {
        mockGetAllCitiesMinimal.mockResolvedValue([
            { id: 'a', status: 'demo' },
        ] as unknown as Awaited<ReturnType<typeof getAllCitiesMinimal>>);

        const body = await (await GET()).json();

        expect(body[0]).toMatchObject({ id: 'a', status: 'demo', officialSupport: false });
    });
});
