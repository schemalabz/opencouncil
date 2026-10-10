/** @jest-environment node */
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));

import { revalidateTag } from 'next/cache';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { notAuthorizedError } from '@/lib/api/errors';
import { POST } from '@/app/api/revalidate/route';

const authorize = withUserAuthorizedToEdit as jest.Mock;

const post = () => POST(new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['cities'] }),
}));

beforeEach(() => jest.clearAllMocks());

describe('POST /api/revalidate', () => {
    it.each([
        [false, 401],
        [true, 403],
    ])('refuses a request (signed in: %p) with %p and revalidates nothing', async (signedIn, status) => {
        authorize.mockRejectedValue(notAuthorizedError(signedIn));

        const response = await post();

        expect(response.status).toBe(status);
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it('revalidates the tags for a superadmin', async () => {
        authorize.mockResolvedValue(true);

        const response = await post();

        expect(response.status).toBe(200);
        expect(authorize).toHaveBeenCalledWith({});
        expect(revalidateTag).toHaveBeenCalledWith('cities', 'max');
    });
});
