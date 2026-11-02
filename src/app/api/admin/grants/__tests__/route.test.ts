/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth', () => ({ getAdminRealms: jest.fn() }));
jest.mock('@/lib/db/grants', () => ({ listGrants: jest.fn(), inviteGrant: jest.fn(), revokeGrant: jest.fn() }));

import { GET, POST, DELETE } from '../route';
import { getAdminRealms } from '@/lib/auth';
import { inviteGrant, listGrants, revokeGrant } from '@/lib/db/grants';
import { BadRequestError, ForbiddenError, UnauthorizedError, validationErrorSchema } from '@/lib/api/errors';

const gate = getAdminRealms as jest.Mock;
const request = (method: string, body?: unknown, query = '') => new NextRequest(`http://localhost/api/admin/grants${query}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
});

const invite = { email: ' Clerk@Example.org ', name: 'Clerk', role: 'records', scope: { cityId: 'athens' } };

beforeEach(() => {
    jest.clearAllMocks();
    gate.mockResolvedValue(['greece']);
});

describe('/api/admin/grants', () => {
    it('GET lists the grants of the realms the gate returns, with the filters of the query', async () => {
        (listGrants as jest.Mock).mockResolvedValue([{ id: 'g1' }]);

        const response = await GET(request('GET', undefined, '?cityId=athens&includeRevoked=1'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ id: 'g1' }]);
        expect(listGrants).toHaveBeenCalledWith({ realms: ['greece'], cityId: 'athens', includeRevoked: true });
    });

    it('GET passes a superadmin as null realms, and no filter without a query', async () => {
        gate.mockResolvedValue(null);
        (listGrants as jest.Mock).mockResolvedValue([]);

        await GET(request('GET'));

        expect(listGrants).toHaveBeenCalledWith({ realms: null, cityId: undefined, includeRevoked: false });
    });

    it('POST invites the normalized email with its role and scope, and answers 201', async () => {
        (inviteGrant as jest.Mock).mockResolvedValue({ id: 'g1', inviteEmailSent: false });

        const response = await POST(request('POST', invite));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ id: 'g1', inviteEmailSent: false });
        expect(inviteGrant).toHaveBeenCalledWith(
            { email: 'clerk@example.org', name: 'Clerk', role: 'records', scope: { cityId: 'athens' } },
            expect.any(NextRequest),
        );
    });

    it.each([
        ['a malformed email', { ...invite, email: 'nope' }, ['email']],
        ['an unknown role', { ...invite, role: 'owner' }, ['role']],
        ['a scope with two keys', { ...invite, scope: { cityId: 'athens', realm: 'greece' } }, ['scope']],
        ['an empty scope', { ...invite, scope: {} }, ['scope']],
        ['an unknown realm', { ...invite, scope: { realm: 'atlantis' } }, ['scope']],
    ])('POST answers %s with a 400 ValidationError', async (_, body, path) => {
        const response = await POST(request('POST', body));

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json.error.some((issue: { path: string[] }) => issue.path[0] === path[0])).toBe(true);
        expect(inviteGrant).not.toHaveBeenCalled();
    });

    it('POST answers a refusal of the grants module with its code', async () => {
        (inviteGrant as jest.Mock).mockRejectedValue(new BadRequestError('cap'));

        const response = await POST(request('POST', invite));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'cap' });
    });

    it('DELETE revokes the grant and answers 204', async () => {
        const response = await DELETE(request('DELETE', { grantId: 'g1' }));

        expect(response.status).toBe(204);
        expect(revokeGrant).toHaveBeenCalledWith('g1');
    });

    it('DELETE answers a missing grantId with a 400 ValidationError', async () => {
        const response = await DELETE(request('DELETE', {}));

        expect(response.status).toBe(400);
        expect(validationErrorSchema.safeParse(await response.json()).success).toBe(true);
        expect(revokeGrant).not.toHaveBeenCalled();
    });

    it.each([
        ['GET', () => GET(request('GET'))],
        ['POST', () => POST(request('POST', { email: 'nope' }))],
        ['DELETE', () => DELETE(request('DELETE', {}))],
    ])('%s answers a refused gate before it validates the body', async (_, handler) => {
        gate.mockRejectedValue(new ForbiddenError());

        const response = await handler();

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Not authorized' });
        expect(inviteGrant).not.toHaveBeenCalled();
        expect(revokeGrant).not.toHaveBeenCalled();
        expect(listGrants).not.toHaveBeenCalled();
    });

    it('answers 401 with no session', async () => {
        gate.mockRejectedValue(new UnauthorizedError());

        const response = await GET(request('GET'));

        expect(response.status).toBe(401);
    });
});
