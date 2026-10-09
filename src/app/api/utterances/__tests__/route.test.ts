/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/utterance', () => ({
    deleteUtterances: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { DELETE } from '../route';
import { getCurrentUser } from '@/lib/auth';
import { deleteUtterances } from '@/lib/db/utterance';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDeleteUtterances = deleteUtterances as jest.MockedFunction<typeof deleteUtterances>;

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

function request(body: string) {
    return new NextRequest('http://localhost/api/utterances', { method: 'DELETE', body });
}

describe('DELETE /api/utterances', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' } as unknown as CurrentUser);
        mockDeleteUtterances.mockResolvedValue(1 as unknown as Awaited<ReturnType<typeof deleteUtterances>>);
    });

    it('returns 401 when there is no authenticated user', async () => {
        mockGetCurrentUser.mockResolvedValue(null as unknown as CurrentUser);
        const res = await DELETE(request(JSON.stringify({ ids: ['u-1'] })));
        expect(res.status).toBe(401);
        expect(mockDeleteUtterances).not.toHaveBeenCalled();
    });

    it.each([
        ['a body that is not JSON', '{'],
        ['a missing ids field', JSON.stringify({})],
        ['an empty ids array', JSON.stringify({ ids: [] })],
        ['an id that is not a string', JSON.stringify({ ids: ['u-1', 2] })],
        ['an empty id', JSON.stringify({ ids: [''] })],
        ['more than 500 ids', JSON.stringify({ ids: Array.from({ length: 501 }, (_, i) => `u-${i}`) })],
    ])('returns 400 for %s', async (_case, body) => {
        const res = await DELETE(request(body));
        expect(res.status).toBe(400);
        expect(mockDeleteUtterances).not.toHaveBeenCalled();
    });

    it('deletes 500 ids', async () => {
        const ids = Array.from({ length: 500 }, (_, i) => `u-${i}`);
        const res = await DELETE(request(JSON.stringify({ ids })));
        expect(res.status).toBe(200);
        expect(mockDeleteUtterances).toHaveBeenCalledWith(ids);
    });

    it('returns 403 when the user cannot edit the city', async () => {
        mockDeleteUtterances.mockRejectedValue(new Error('Not authorized'));
        const res = await DELETE(request(JSON.stringify({ ids: ['u-1'] })));
        expect(res.status).toBe(403);
    });

    it('returns 500 when the deletion fails', async () => {
        mockDeleteUtterances.mockRejectedValue(new Error('db down'));
        const res = await DELETE(request(JSON.stringify({ ids: ['u-1'] })));
        expect(res.status).toBe(500);
    });
});
