/** @jest-environment node */

/**
 * Starting a body profile and storing what comes back. The two things that
 * matter: the request selects documents the way pollDecisions does (the city's
 * Diavgeia organization plus the body's unit scopes), and the result is written
 * against the body the REQUEST named — the task treats its ids as labels and
 * never resolves them, so the result cannot be trusted to say which body it is.
 */
const mockBodyFindUnique = jest.fn();
const mockTaskFindUnique = jest.fn();
const mockStartTask = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();
const mockGetMostRecentMeetingIdForBody = jest.fn();
const mockStoreProfiledDecisionConventions = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        administrativeBody: { findUnique: (...a: unknown[]) => mockBodyFindUnique(...a) },
        taskStatus: { findUnique: (...a: unknown[]) => mockTaskFindUnique(...a) },
    },
}));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a) }));
jest.mock('@/lib/tasks/tasks', () => ({ startTask: (...a: unknown[]) => mockStartTask(...a) }));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({
    getMostRecentMeetingIdForBody: (...a: unknown[]) => mockGetMostRecentMeetingIdForBody(...a),
    storeProfiledDecisionConventions: (...a: unknown[]) => mockStoreProfiledDecisionConventions(...a),
}));

import { profileBodyConventions } from '@/lib/tasks/profileBody';
import { handleProfileBodyResult } from '@/lib/tasks/profileBodyResult';
import type { ProfileBodyRequest, ProfileBodyResult } from '@/lib/apiTypes';

const BODY = {
    id: 'body-1',
    name: 'Δημοτική Επιτροπή',
    cityId: 'papagos-cholargos',
    diavgeiaUnitIds: ['100084744', '84655:100010590'],
    city: { diavgeiaUid: '6104' },
};

const RESULT: ProfileBodyResult = {
    conventions: {
        version: 1,
        rollCallLayout: 'composition_and_absent',
        presentListMeaning: 'opening',
        attendanceChangeAnchors: ['agenda_item'],
        statesPerDecisionAttendance: false,
        statesPerVoteAbsence: false,
        usesSubstitutes: true,
        namedVoters: 'none',
        mayorStatedSeparately: true,
        notes: 'holds-facts-we-cannot-store',
        provenance: { source: 'profile', profiledAt: '2026-09-17', documentsSampled: 20 },
    },
    facts: { documents: 20, notDecisions: 0 },
    adas: ['ΨΧ1'],
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
};

beforeEach(() => {
    jest.clearAllMocks();
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockBodyFindUnique.mockResolvedValue(BODY);
    mockGetMostRecentMeetingIdForBody.mockResolvedValue('meeting-9');
    mockStartTask.mockResolvedValue({ id: 'task-1' });
    mockStoreProfiledDecisionConventions.mockResolvedValue(true);
    mockTaskFindUnique.mockResolvedValue({
        id: 'task-1',
        type: 'profileBody',
        requestBody: JSON.stringify({ cityId: BODY.cityId, administrativeBodyId: BODY.id } as Partial<ProfileBodyRequest>),
    });
});

describe('profileBodyConventions', () => {
    it("selects documents by the city's organization and the body's unit scopes", async () => {
        await profileBodyConventions('body-1');

        const [taskType, body, councilMeetingId, cityId] = mockStartTask.mock.calls[0];
        expect(taskType).toBe('profileBody');
        expect(body).toMatchObject({
            cityId: 'papagos-cholargos',
            administrativeBodyId: 'body-1',
            diavgeiaUid: '6104',
            diavgeiaUnitIds: ['100084744', '84655:100010590'],
        });
        expect(councilMeetingId).toBe('meeting-9');
        expect(cityId).toBe('papagos-cholargos');
    });

    it('hangs the task off the body\'s most recent meeting, since a TaskStatus needs one', async () => {
        mockGetMostRecentMeetingIdForBody.mockResolvedValue(null);
        await expect(profileBodyConventions('body-1')).rejects.toThrow('no meeting');
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it("authorizes against the body's own city before starting anything", async () => {
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));
        await expect(profileBodyConventions('body-1')).rejects.toThrow('Not authorized');
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'papagos-cholargos' });
        expect(mockStartTask).not.toHaveBeenCalled();
    });

    it('refuses a body whose city has no Diavgeia organization, and one with no unit scopes', async () => {
        mockBodyFindUnique.mockResolvedValue({ ...BODY, city: { diavgeiaUid: null } });
        await expect(profileBodyConventions('body-1')).rejects.toThrow('Diavgeia UID');

        mockBodyFindUnique.mockResolvedValue({ ...BODY, diavgeiaUnitIds: [] });
        await expect(profileBodyConventions('body-1')).rejects.toThrow('unit ids');
        expect(mockStartTask).not.toHaveBeenCalled();
    });
});

describe('handleProfileBodyResult', () => {
    it('stores the conventions against the body the request named', async () => {
        await handleProfileBodyResult('task-1', RESULT);
        expect(mockStoreProfiledDecisionConventions).toHaveBeenCalledWith('body-1', RESULT.conventions);
    });

    it('accepts the store declining to overwrite a confirmed row', async () => {
        mockStoreProfiledDecisionConventions.mockResolvedValue(false);
        await expect(handleProfileBodyResult('task-1', RESULT)).resolves.toBeUndefined();
    });

    it('writes nothing for a task of another type, or a result carrying no conventions', async () => {
        mockTaskFindUnique.mockResolvedValue({ id: 'task-1', type: 'pollDecisions', requestBody: '{}' });
        await expect(handleProfileBodyResult('task-1', RESULT)).rejects.toThrow('not a profileBody task');

        mockTaskFindUnique.mockResolvedValue({
            id: 'task-1', type: 'profileBody', requestBody: JSON.stringify({ administrativeBodyId: 'body-1' }),
        });
        await expect(handleProfileBodyResult('task-1', { ...RESULT, conventions: undefined as never })).rejects.toThrow('no conventions');
        expect(mockStoreProfiledDecisionConventions).not.toHaveBeenCalled();
    });
});
