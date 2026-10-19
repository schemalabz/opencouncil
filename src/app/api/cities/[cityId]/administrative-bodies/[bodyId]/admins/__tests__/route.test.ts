/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/bodyAdmins', () => ({ listBodyAdmins: jest.fn(), addBodyAdmin: jest.fn(), removeBodyAdmin: jest.fn() }));

import { GET, POST, DELETE } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/admins/route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { addBodyAdmin, listBodyAdmins, removeBodyAdmin } from '@/lib/db/bodyAdmins';
import { ForbiddenError, UnauthorizedError, validationErrorSchema } from '@/lib/api/errors';

const guard = withUserAuthorizedToEdit as jest.Mock;
const params = { params: Promise.resolve({ cityId: 'zografou', bodyId: 'b1' }) };
const request = (method: string, body?: unknown) => new NextRequest('http://localhost/api/cities/zografou/administrative-bodies/b1/admins', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

beforeEach(() => {
    jest.clearAllMocks();
    guard.mockResolvedValue(undefined);
});

describe('/api/cities/[cityId]/administrative-bodies/[bodyId]/admins', () => {
    it('POST invites the normalized email', async () => {
        (addBodyAdmin as jest.Mock).mockResolvedValue({ created: true });

        const response = await POST(request('POST', { email: ' Clerk@Example.org ', name: 'Clerk' }), params);

        expect(response.status).toBe(201);
        expect(guard).toHaveBeenCalledWith({ cityId: 'zografou', administrativeBodyId: 'b1' });
        expect(addBodyAdmin).toHaveBeenCalledWith('zografou', 'b1', { email: 'clerk@example.org', name: 'Clerk' }, expect.anything());
    });

    it('POST answers a malformed email with a 400 ValidationError', async () => {
        const response = await POST(request('POST', { email: 'nope' }), params);

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json).toEqual({ error: [{ code: 'invalid_format', path: ['email'], message: 'Invalid email address' }] });
        expect(addBodyAdmin).not.toHaveBeenCalled();
    });

    it('DELETE answers a missing userId with a 400 ValidationError', async () => {
        const response = await DELETE(request('DELETE', {}), params);

        expect(response.status).toBe(400);
        expect(validationErrorSchema.safeParse(await response.json()).success).toBe(true);
        expect(removeBodyAdmin).not.toHaveBeenCalled();
    });

    it.each([
        ['POST', POST, { email: 'nope' }],
        ['DELETE', DELETE, {}],
    ])('%s answers a refused guard before it validates the body', async (method, handler, body) => {
        guard.mockRejectedValue(new ForbiddenError());

        const response = await handler(request(method, body), params);

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Not authorized' });
    });

    it.each([
        [new UnauthorizedError(), 401],
        [new ForbiddenError(), 403],
    ])('GET answers a refused guard (%p) with %p', async (error, status) => {
        (listBodyAdmins as jest.Mock).mockRejectedValue(error);

        const response = await GET(request('GET'), params);

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: error.message });
    });
});
