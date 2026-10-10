/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({
    editAdministrativeBody: jest.fn().mockResolvedValue({ id: 'b1' }),
    deleteAdministrativeBody: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({
    confirmDecisionConventions: jest.fn().mockResolvedValue({ id: 'b1' }),
}));
jest.mock('@/lib/derivation/rederive', () => ({ rederiveMeetingsOfBody: jest.fn() }));

import { PUT } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/route';
import { editAdministrativeBody } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';

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

    it('updates the body for a request without confirmConventions', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', diavgeiaUnitIds: '81689' });
        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'Δημοτικό Συμβούλιο', diavgeiaUnitIds: ['81689'] }));
        expect(confirmDecisionConventions).not.toHaveBeenCalled();
    });
});
