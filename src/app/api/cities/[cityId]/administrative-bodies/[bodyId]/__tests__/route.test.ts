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
    getBodyPageRow: jest.fn(),
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/meetings', () => ({
    upcomingMeetingsTag: (realm: string) => `realm:${realm}:upcoming-meetings`,
}));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({
    confirmDecisionConventions: jest.fn().mockResolvedValue({ id: 'b1' }),
}));
jest.mock('@/lib/derivation/rederive', () => ({ rederiveMeetingsOfBody: jest.fn() }));

import { DELETE, PUT } from '@/app/api/cities/[cityId]/administrative-bodies/[bodyId]/route';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { deleteAdministrativeBody, editAdministrativeBody, editAdministrativeBodyContacts, getBodyPageRow } from '@/lib/db/administrativeBodies';
import { confirmDecisionConventions } from '@/lib/db/administrativeBodiesInternal';
import { ConflictError, ForbiddenError, UnauthorizedError, validationErrorSchema } from '@/lib/api/errors';

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
        expect(data).toMatchObject({ youtubeChannelUrl: undefined, diavgeiaUnitIds: undefined });
    });

    it('clears the channel and the Diavgeia units that an update sends empty', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', youtubeChannelUrl: '', diavgeiaUnitIds: '' });
        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ youtubeChannelUrl: null, diavgeiaUnitIds: [] }), undefined);
    });

    it('updates the body for a request without confirmConventions', async () => {
        const response = await put({ name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', diavgeiaUnitIds: '81689' });
        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'Δημοτικό Συμβούλιο', diavgeiaUnitIds: ['81689'] }), undefined);
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

    it('writes the YouTube channel and ignores the rest', async () => {
        const response = await put({ name: 'Renamed', type: 'committee', youtubeChannelUrl: '' });

        expect(response.status).toBe(200);
        expect(guard).toHaveBeenCalledWith({ cityId: 'zografou', administrativeBodyId: 'b1' });
        expect(editAdministrativeBodyContacts).toHaveBeenCalledWith('b1', { youtubeChannelUrl: null }, undefined);
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it.each([
        [{ youtubeChannelUrl: 'javascript:alert(1)' }, ['youtubeChannelUrl']],
        [{ youtubeChannelUrl: 'https://example.org/channel' }, ['youtubeChannelUrl']],
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

        const response = await put({ youtubeChannelUrl: 'javascript:alert(1)' });

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: error.message });
        expect(editAdministrativeBodyContacts).not.toHaveBeenCalled();
    });
});

describe('PUT /api/cities/[cityId]/administrative-bodies/[bodyId] with document send settings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (isUserAuthorizedToEdit as jest.Mock).mockResolvedValue(true);
        (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
    });

    const BODY = { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' };

    // A body admin reaches the contacts path (#828), which carries the settings too (#874)
    it('lets an admin of the body replace its document send settings, and nothing else', async () => {
        (isUserAuthorizedToEdit as jest.Mock).mockResolvedValue(false);
        const settings = [{ kind: 'minutes', enabled: true, recipientEmails: ['minutes@example.org'] }];

        const response = await put({ name: 'Renamed', youtubeChannelUrl: '', documentSendSettings: settings });

        expect(response.status).toBe(200);
        expect(withUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou', administrativeBodyId: 'b1' });
        expect(editAdministrativeBodyContacts).toHaveBeenCalledWith('b1', { youtubeChannelUrl: null }, settings);
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it('replaces the document send settings of the body', async () => {
        const settings = [
            { kind: 'transcript', enabled: false, recipientEmails: [] },
            { kind: 'minutes', enabled: true, recipientEmails: ['minutes@example.org'] },
        ];

        const response = await put({ ...BODY, documentSendSettings: settings });

        expect(response.status).toBe(200);
        expect(isUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'Δημοτικό Συμβούλιο' }), settings);
    });

    it('refuses an enabled document without a recipient', async () => {
        const response = await put({ ...BODY, documentSendSettings: [{ kind: 'minutes', enabled: true, recipientEmails: [] }] });

        expect(response.status).toBe(400);
        const { error } = await response.json();
        expect(error.map((issue: { path: unknown[] }) => issue.path)).toEqual([['documentSendSettings', 0, 'recipientEmails']]);
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });

    it('rejects a recipient that is not an address', async () => {
        const response = await put({
            ...BODY,
            documentSendSettings: [{ kind: 'minutes', enabled: true, recipientEmails: ['not-an-address'] }],
        });

        expect(response.status).toBe(400);
        expect(editAdministrativeBody).not.toHaveBeenCalled();
    });
});

const mockIsCityAdmin = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockRequire = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockEditContacts = editAdministrativeBodyContacts as jest.MockedFunction<typeof editAdministrativeBodyContacts>;
const mockEditBody = editAdministrativeBody as jest.MockedFunction<typeof editAdministrativeBody>;
const mockGetBodyPageRow = getBodyPageRow as jest.MockedFunction<typeof getBodyPageRow>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const CITY = 'chania';
const BODY = 'youth';
const props = { params: Promise.resolve({ cityId: CITY, bodyId: BODY }) };
const SETTINGS = [{ kind: 'transcript', enabled: true, recipientEmails: ['secretary@example.org'] }];
const CONTACTS = { youtubeChannelUrl: 'https://www.youtube.com/@youth', documentSendSettings: SETTINGS };

function putAs(body: unknown) {
    return PUT({ json: async () => body } as unknown as NextRequest, props);
}

/**
 * PUT of a body: a payload with the contact fields alone reaches the
 * contacts write, whoever sends it. The page of the body sends that payload
 * for an admin of the body and for an admin of the city (#828, #829).
 */
function resetBodyPageMocks() {
    jest.clearAllMocks();
    mockRequire.mockResolvedValue(true);
    mockEditContacts.mockResolvedValue({ id: BODY } as never);
    mockEditBody.mockResolvedValue({ id: BODY, type: 'youthCouncil' } as never);
    mockGetBodyPageRow.mockResolvedValue({ id: BODY, type: 'youthCouncil' } as never);
}

describe('PUT /api/cities/{cityId}/administrative-bodies/{bodyId} from the page of the body', () => {
    beforeEach(resetBodyPageMocks);
    afterAll(() => mockIsCityAdmin.mockResolvedValue(true));

    it('writes the contacts for an admin of the body', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await putAs(CONTACTS);

        expect(res.status).toBe(200);
        expect(mockRequire).toHaveBeenCalledWith({ cityId: CITY, administrativeBodyId: BODY });
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, { youtubeChannelUrl: CONTACTS.youtubeChannelUrl }, SETTINGS);
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('writes the contacts for an admin of the city when the payload holds the contacts alone', async () => {
        mockIsCityAdmin.mockResolvedValue(true);

        const res = await putAs(CONTACTS);

        expect(res.status).toBe(200);
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, { youtubeChannelUrl: CONTACTS.youtubeChannelUrl }, SETTINGS);
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('passes the updates switch of a secondary body through the contacts write', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await putAs({ ...CONTACTS, notificationBehavior: 'NOTIFICATIONS_AUTO' });

        expect(res.status).toBe(200);
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, { youtubeChannelUrl: CONTACTS.youtubeChannelUrl, notificationBehavior: 'NOTIFICATIONS_AUTO' }, SETTINGS);
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('refuses an approval mode on the contacts write: nobody approves for a secondary body', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await putAs({ ...CONTACTS, notificationBehavior: 'NOTIFICATIONS_APPROVAL' });

        expect(res.status).toBe(400);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });

    it('keeps the full write for an admin of the city who sends the whole body', async () => {
        mockIsCityAdmin.mockResolvedValue(true);

        const res = await putAs({ name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' });

        expect(res.status).toBe(200);
        expect(mockEditBody).toHaveBeenCalledTimes(1);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });

    it('busts the lists that read the tier when the type of the body changes, and not otherwise', async () => {
        mockIsCityAdmin.mockResolvedValue(true);
        const whole = { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' };

        await putAs(whole);
        expect(mockRevalidateTag).not.toHaveBeenCalledWith('cities:all', 'max');
        expect(mockRevalidateTag).not.toHaveBeenCalledWith(`city:${CITY}:people`, 'max');

        mockGetBodyPageRow.mockResolvedValue({ id: BODY, type: 'committee' } as never);
        await putAs(whole);
        expect(mockRevalidateTag).toHaveBeenCalledWith(`city:${CITY}:meetings`, 'max');
        expect(mockRevalidateTag).toHaveBeenCalledWith(`city:${CITY}:people`, 'max');
        expect(mockRevalidateTag).toHaveBeenCalledWith('cities:all', 'max');
        expect(mockRevalidateTag).toHaveBeenCalledWith('realm:greece:landing-subjects', 'max');
    });

    it('answers 403 when the caller administers neither the body nor the city', async () => {
        mockIsCityAdmin.mockResolvedValue(false);
        mockRequire.mockRejectedValue(new ForbiddenError('Not authorized'));

        const res = await putAs(CONTACTS);

        expect(res.status).toBe(403);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });
});

describe('PUT of a body that changes tier and keeps its type (#829)', () => {
    const COMPANY = { name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA', type: 'council' };

    beforeEach(() => {
        jest.clearAllMocks();
        (isUserAuthorizedToEdit as jest.Mock).mockResolvedValue(true);
        (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
    });

    it('writes the tier of a superadmin and refreshes every list that reads it', async () => {
        (getBodyPageRow as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'primary' });
        (editAdministrativeBody as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'secondary' });

        const response = await put({ ...COMPANY, tier: 'secondary' });

        expect(response.status).toBe(200);
        expect(editAdministrativeBody).toHaveBeenCalledWith('b1', expect.objectContaining({ tier: 'secondary' }), undefined);
        // `city:…:basic` holds the city counts of the identity band, which count the primary tier.
        expect(jest.mocked(revalidateTag).mock.calls.map(([tag]) => tag)).toEqual([
            'city:zografou:administrativeBodies',
            'city:zografou:meetings',
            'city:zografou:people',
            'city:zografou:basic',
            'cities:all',
            'realm:greece:cities:all',
            'realm:greece:landing-subjects',
            'realm:greece:upcoming-meetings',
        ]);
    });

    it('refreshes nothing beyond the bodies when neither the tier nor the type changes', async () => {
        (getBodyPageRow as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'secondary' });
        (editAdministrativeBody as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'secondary' });

        await put({ ...COMPANY, tier: 'secondary' });

        expect(revalidateTag).not.toHaveBeenCalledWith('cities:all', 'max');
        expect(revalidateTag).not.toHaveBeenCalledWith('city:zografou:meetings', 'max');
    });

    it('leaves the tier out of the write when the request leaves it out', async () => {
        (getBodyPageRow as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'secondary' });
        (editAdministrativeBody as jest.Mock).mockResolvedValue({ id: 'b1', type: 'council', tier: 'secondary' });

        await put(COMPANY);

        expect((editAdministrativeBody as jest.Mock).mock.calls[0][1].tier).toBeUndefined();
    });

    it('answers 400 to a tier alone from an admin of the city, and writes nothing', async () => {
        const response = await put({ tier: 'secondary' });

        expect(response.status).toBe(400);
        expect(editAdministrativeBody).not.toHaveBeenCalled();
        expect(editAdministrativeBodyContacts).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/cities/[cityId]/administrative-bodies/[bodyId]', () => {
    const remove = () => DELETE(
        new Request('http://localhost/api/cities/zografou/administrative-bodies/b1', { method: 'DELETE' }) as unknown as NextRequest,
        { params: Promise.resolve({ cityId: 'zografou', bodyId: 'b1' }) },
    );

    beforeEach(() => {
        jest.clearAllMocks();
        (withUserAuthorizedToEdit as jest.Mock).mockResolvedValue(undefined);
    });

    it.each([
        ['meetings', 'The body still has 2 meeting(s) and 0 member role(s). Delete its meetings and its members (the people) first. For a member who holds another role, delete only the role on this body.'],
        ['member roles', 'The body still has 0 meeting(s) and 3 member role(s). Delete its meetings and its members (the people) first. For a member who holds another role, delete only the role on this body.'],
    ])('answers 409 with the reason for a body that still has %s', async (_label, message) => {
        (deleteAdministrativeBody as jest.Mock).mockRejectedValue(new ConflictError(message));

        const response = await remove();

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: message });
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it('answers 204 for an empty body', async () => {
        (deleteAdministrativeBody as jest.Mock).mockResolvedValue(undefined);

        const response = await remove();

        expect(response.status).toBe(204);
        expect(deleteAdministrativeBody).toHaveBeenCalledWith('b1');
        expect(revalidateTag).toHaveBeenCalledWith('city:zografou:administrativeBodies', 'max');
    });
});
