/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
}));
// An admin of the city: an admin of the body only takes the contacts branch.
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    withUserAuthorizedToEdit: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({
    editAdministrativeBody: jest.fn().mockResolvedValue({ id: 'b1' }),
    editAdministrativeBodyContacts: jest.fn().mockResolvedValue({ id: 'b1' }),
    deleteAdministrativeBody: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({
    confirmDecisionConventions: jest.fn().mockResolvedValue({ id: 'b1' }),
}));
jest.mock('@/lib/derivation/rederive', () => ({ rederiveMeetingsOfBody: jest.fn() }));

import { PUT } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/route';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { editAdministrativeBody, editAdministrativeBodyContacts } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { ForbiddenError, UnauthorizedError, validationErrorSchema } from '@/lib/api/errors';

const CONVENTIONS = {
    version: 1,
    rollCallLayout: 'present_and_absent',
    presentListMeaning: 'opening',
    attendanceChangeAnchors: ['session_phase', 'agenda_item'],
    statesPerDecisionAttendance: false,
    statesPerVoteAbsence: false,
    usesSubstitutes: false,
    namedVoters: 'dissenters_only',
    mayorStatedSeparately: true,
    provenance: { source: 'profile' },
};

function put(body: unknown) {
    const request = new Request('http://localhost/api/cities/zografou/administrative-bodies/b1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
    return PUT(request, { params: Promise.resolve({ cityId: 'zografou', bodyId: 'b1' }) });
}

describe('PUT /api/cities/[cityId]/administrative-bodies/[bodyId]', () => {
    beforeEach(() => jest.clearAllMocks());

    it('confirms the conventions, with the anchors in the current vocabulary', async () => {
        const response = await put({ confirmConventions: true, decisionConventions: CONVENTIONS });
        expect(response.status).toBe(200);
        expect(confirmDecisionConventions).toHaveBeenCalledWith('b1', expect.objectContaining({ attendanceChangeAnchors: ['phase', 'agenda_item'] }));
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it('gives the issues of a failed confirmation paths under decisionConventions', async () => {
        const response = await put({ confirmConventions: true, decisionConventions: { ...CONVENTIONS, rollCallLayout: 'whatever' } });
        expect(response.status).toBe(400);
        const { error } = await response.json();
        expect(error.map((issue: { path: unknown[] }) => issue.path)).toEqual([['decisionConventions', 'rollCallLayout']]);
        expect(confirmDecisionConventions).not.toHaveBeenCalled();
    });

    it('does not read the text "false" as a confirmation', async () => {
        const response = await put({ confirmConventions: 'false', decisionConventions: CONVENTIONS });
        expect(response.status).toBe(400);
        const { error } = await response.json();
        expect(error[0].path).toEqual(['confirmConventions']);
        expect(confirmDecisionConventions).not.toHaveBeenCalled();
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it('keeps the fields that an update leaves out', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' });
        expect(response.status).toBe(200);
        const [, data] = (editAdministrativeBody as jest.Mock).mock.calls[0];
        expect(data).toMatchObject({ youtubeChannelUrl: undefined, contactEmails: undefined, diavgeiaUnitIds: undefined });
    });

    it('clears the channel and the Diavgeia units that an update sends empty', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', youtubeChannelUrl: '', diavgeiaUnitIds: '', contactEmails: [] });
        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ youtubeChannelUrl: null, diavgeiaUnitIds: [], contactEmails: [] }));
    });

    it('updates the body for a request without confirmConventions', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', diavgeiaUnitIds: '81689' });
        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'Δημοτικό Συμβούλιο', diavgeiaUnitIds: ['81689'] }));
        expect(confirmDecisionConventions).not.toHaveBeenCalled();
    });
});

describe('PUT /api/cities/[cityId]/administrative-bodies/[bodyId] by an admin of the body', () => {
    const guard = withUserAuthorizedToEdit as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        (isUserAuthorizedToEdit as jest.Mock).mockResolvedValue(false);
        guard.mockResolvedValue(undefined);
    });
    afterAll(() => (isUserAuthorizedToEdit as jest.Mock).mockResolvedValue(true));

    it('writes the two contact fields and ignores the rest', async () => {
        const response = await put({ name: 'Renamed', type: 'committee', contactEmails: ['clerk@example.org'], youtubeChannelUrl: '' });

        expect(response.status).toBe(200);
        expect(guard).toHaveBeenCalledWith({ cityId: 'zografou', administrativeBodyId: 'b1' });
        expect(editAdministrativeBodyContacts).toHaveBeenCalledWith('b1', { youtubeChannelUrl: null, contactEmails: ['clerk@example.org'] });
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it.each([
        [{ contactEmails: ['not-an-email'] }, ['contactEmails', 0]],
        [{ youtubeChannelUrl: 'javascript:alert(1)' }, ['youtubeChannelUrl']],
    ])('answers %j with a 400 ValidationError and writes nothing', async (body, path) => {
        const response = await put(body);

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(validationErrorSchema.safeParse(json).success).toBe(true);
        expect(json.error.map((issue: { path: unknown[] }) => issue.path)).toEqual([path]);
        expect(editAdministrativeBodyContacts).not.toHaveBeenCalled();
    });

    it.each([
        [new UnauthorizedError(), 401],
        [new ForbiddenError(), 403],
    ])('answers a refused guard (%p) with %p before it validates the body', async (error, status) => {
        guard.mockRejectedValue(error);

        const response = await put({ contactEmails: ['not-an-email'] });

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: error.message });
        expect(editAdministrativeBodyContacts).not.toHaveBeenCalled();
    });
});
