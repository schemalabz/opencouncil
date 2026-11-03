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
    it('GET lists the grants of the realms the gate returns, with the flag of the query', async () => {
        (listGrants as jest.Mock).mockResolvedValue([{ id: 'g1' }]);

        const response = await GET(request('GET', undefined, '?includeRevoked=1'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{ id: 'g1' }]);
        expect(listGrants).toHaveBeenCalledWith({ realms: ['greece'], cityId: undefined, includeRevoked: true });
    });

    it('GET passes a superadmin as null realms, and no filter without a query', async () => {
        gate.mockResolvedValue(null);
        (listGrants as jest.Mock).mockResolvedValue([]);

        await GET(request('GET'));

        expect(listGrants).toHaveBeenCalledWith({ realms: null, cityId: undefined, includeRevoked: false });
    });

    // The Team tab of a city serves its city and body admins, who hold no
    // realm: the grants module checks what they administer in the city.
    it('GET with a cityId skips the realm gate and leaves the check to the grants module', async () => {
        (listGrants as jest.Mock).mockResolvedValue([]);

        await GET(request('GET', undefined, '?cityId=athens'));

        expect(gate).not.toHaveBeenCalled();
        expect(listGrants).toHaveBeenCalledWith({ realms: null, cityId: 'athens', includeRevoked: false });
    });

    it('GET answers a refusal of the grants module with its status', async () => {
        (listGrants as jest.Mock).mockRejectedValue(new ForbiddenError());

        const response = await GET(request('GET', undefined, '?cityId=athens'));

        expect(response.status).toBe(403);
    });

    it('POST invites the normalized email with its role and scope, and answers 201', async () => {
        (inviteGrant as jest.Mock).mockResolvedValue({ id: 'g1', inviteEmailSent: false });

        const response = await POST(request('POST', invite));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ id: 'g1', inviteEmailSent: false });
        expect(gate).not.toHaveBeenCalled();
        expect(inviteGrant).toHaveBeenCalledWith({ email: 'clerk@example.org', name: 'Clerk', role: 'records', scope: { cityId: 'athens' } });
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

    it('POST answers 403 when the grants module refuses the sender', async () => {
        (inviteGrant as jest.Mock).mockRejectedValue(new ForbiddenError());

        const response = await POST(request('POST', invite));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Not authorized' });
    });

    it('DELETE revokes the grant and answers 204', async () => {
        const response = await DELETE(request('DELETE', { grantId: 'g1' }));

        expect(response.status).toBe(204);
        expect(gate).not.toHaveBeenCalled();
        expect(revokeGrant).toHaveBeenCalledWith('g1');
    });

    it('DELETE answers a missing grantId with a 400 ValidationError', async () => {
        const response = await DELETE(request('DELETE', {}));

        expect(response.status).toBe(400);
        expect(validationErrorSchema.safeParse(await response.json()).success).toBe(true);
        expect(revokeGrant).not.toHaveBeenCalled();
    });

    it('GET of the whole realm answers a refused gate before it lists', async () => {
        gate.mockRejectedValue(new ForbiddenError());

        const response = await GET(request('GET'));

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Not authorized' });
        expect(listGrants).not.toHaveBeenCalled();
    });

    it.each([
        ['GET', () => { gate.mockRejectedValue(new UnauthorizedError()); return GET(request('GET')); }],
        ['POST', () => { (inviteGrant as jest.Mock).mockRejectedValue(new UnauthorizedError()); return POST(request('POST', invite)); }],
        ['DELETE', () => { (revokeGrant as jest.Mock).mockRejectedValue(new UnauthorizedError()); return DELETE(request('DELETE', { grantId: 'g1' })); }],
    ])('%s answers 401 with no session', async (_, handler) => {
        const response = await handler();

        expect(response.status).toBe(401);
    });
});
