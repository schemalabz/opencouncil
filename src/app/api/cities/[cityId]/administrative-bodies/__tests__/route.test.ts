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

import { GET } from '../route';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getAdministrativeBodiesForCity, getPublicAdministrativeBodiesForCity } from '@/lib/db/administrativeBodies';

const mockIsUserAuthorizedToEdit = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockGetFull = getAdministrativeBodiesForCity as jest.MockedFunction<typeof getAdministrativeBodiesForCity>;
const mockGetPublic = getPublicAdministrativeBodiesForCity as jest.MockedFunction<typeof getPublicAdministrativeBodiesForCity>;

const PUBLIC_BODY = { id: 'b1', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' as const, cityId: 'zografou', youtubeChannelUrl: null, place: null };
const FULL_BODY = {
    ...PUBLIC_BODY,
    notificationBehavior: 'NOTIFICATIONS_APPROVAL' as const,
    showUnreviewedTranscript: true,
    contactEmails: ['secretary@example.org'],
    diavgeiaUnitIds: ['81689'],
    decisionConventions: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
};

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
        expect(body[0].contactEmails).toEqual(['secretary@example.org']);
    });
});
