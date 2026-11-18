/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({
    getAdministrativeBodiesForCity: jest.fn(),
    getPublicAdministrativeBodiesForCity: jest.fn(),
    createAdministrativeBody: jest.fn(),
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));

import { GET, POST } from '../route';
import { revalidateTag } from 'next/cache';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { createAdministrativeBody, getAdministrativeBodiesForCity, getPublicAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies';

const mockIsUserAuthorizedToEdit = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockGetFull = getAdministrativeBodiesForCity as jest.MockedFunction<typeof getAdministrativeBodiesForCity>;
const mockGetPublic = getPublicAdministrativeBodiesForCity as jest.MockedFunction<typeof getPublicAdministrativeBodiesForCity>;
const mockCreate = createAdministrativeBody as jest.MockedFunction<typeof createAdministrativeBody>;

const PUBLIC_BODY = { id: 'b1', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' as const, tier: 'primary' as const, cityId: 'zografou', youtubeChannelUrl: null, place: null };
const FULL_BODY = {
    ...PUBLIC_BODY,
    notificationBehavior: 'NOTIFICATIONS_APPROVAL' as const,
    showUnreviewedTranscript: true,
    diavgeiaUnitIds: ['81689'],
    decisionConventions: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    documentSendSettings: [
        { kind: 'transcript' as const, enabled: true, enabledAt: new Date('2026-01-01'), recipientEmails: ['secretary@example.org'] },
    ],
};

function post(cityId: string, body: unknown) {
    const request = new Request(`http://localhost/api/cities/${cityId}/administrative-bodies`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    }) as unknown as NextRequest;
    return POST(request, { params: Promise.resolve({ cityId }) });
}

async function get(cityId: string) {
    const request = new Request(`http://localhost/api/cities/${cityId}/administrative-bodies`) as unknown as NextRequest;
    return GET(request, { params: Promise.resolve({ cityId }) });
}

describe('GET /api/cities/[cityId]/administrative-bodies', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetPublic.mockResolvedValue([PUBLIC_BODY]);
        mockGetFull.mockResolvedValue([FULL_BODY]);
    });

    it('gives a reader who cannot edit the city the public fields only', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);

        const body = await (await get('zografou')).json();

        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
        expect(mockGetFull).not.toHaveBeenCalled();
        expect(body).toEqual([PUBLIC_BODY]);
    });

    it('gives an editor of the city the full rows the body form edits', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);

        const body = await (await get('zografou')).json();

        expect(mockGetPublic).not.toHaveBeenCalled();
        expect(body[0].documentSendSettings[0].recipientEmails).toEqual(['secretary@example.org']);
    });
});

describe('POST /api/cities/[cityId]/administrative-bodies', () => {
    const newBody = { name: 'Δημοτική Επιτροπή', name_en: 'Municipal Committee', type: 'committee' };

    beforeEach(() => {
        jest.clearAllMocks();
        mockCreate.mockResolvedValue({ ...FULL_BODY, id: 'b2' });
    });

    it('writes the document send settings with the body', async () => {
        const settings = [
            { kind: 'transcript', enabled: true, recipientEmails: ['to@example.org', 'cc@example.org'] },
            { kind: 'minutes', enabled: false, recipientEmails: [] },
        ];

        const response = await post('zografou', { ...newBody, documentSendSettings: settings });

        expect(response.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ cityId: 'zografou', type: 'committee' }), settings);
    });

    it('leaves the settings alone when the request carries none', async () => {
        await post('zografou', newBody);

        expect(mockCreate).toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('rejects a document that is switched on with no recipient', async () => {
        const response = await post('zografou', {
            ...newBody,
            documentSendSettings: [{ kind: 'minutes', enabled: true, recipientEmails: [] }],
        });

        expect(response.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects a setting under the old `document` key', async () => {
        const response = await post('zografou', {
            ...newBody,
            documentSendSettings: [{ document: 'minutes', enabled: false, recipientEmails: [] }],
        });

        expect(response.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe('POST of a body: its tier (#829)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (withUserAuthorizedToEdit as jest.Mock).mockReset();
        mockCreate.mockResolvedValue({ ...FULL_BODY, id: 'b2' });
    });

    it('gives a body with no tier the default of its type, and the notification default of that tier', async () => {
        await post('zografou', { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' });
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' }), undefined);
        await post('zografou', { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' });
        expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ tier: 'primary', notificationBehavior: 'NOTIFICATIONS_APPROVAL' }), undefined);
    });

    it('refreshes the list of secondary bodies that search reads for a secondary body, and not for a primary one', async () => {
        await post('zografou', { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' });
        expect(revalidateTag).not.toHaveBeenCalledWith('cities:all', 'max');
        await post('zografou', { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' });
        expect(revalidateTag).toHaveBeenCalledWith('cities:all', 'max');
        expect(revalidateTag).toHaveBeenCalledWith('realm:greece:cities:all', 'max');
    });

    it('keeps the tier that a superadmin sends, and starts a secondary council with its notifications off', async () => {
        await post('zografou', { name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA', type: 'council', tier: 'secondary' });
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'council', tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' }), undefined);
    });
});
