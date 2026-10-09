/** @jest-environment node */
import type { NextRequest } from 'next/server';

/**
 * PUT of a body: a payload with the two contact fields alone reaches the
 * contacts write, whoever sends it. The page of the body sends that payload
 * for an admin of the body and for an admin of the city (#828, #829).
 */
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
}));
jest.mock('next/server', () => {
    const actual = jest.requireActual('next/server');
    return { ...actual, after: jest.fn() };
});
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({
    editAdministrativeBody: jest.fn(),
    editAdministrativeBodyContacts: jest.fn(),
    deleteAdministrativeBody: jest.fn(),
    getBodyPageRow: jest.fn(),
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/meetings', () => ({
    cityListTags: (realm: string) => ['cities:all', `realm:${realm}:cities:all`],
    upcomingMeetingsTag: (realm: string) => `realm:${realm}:upcoming-meetings`,
}));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({ confirmDecisionConventions: jest.fn() }));
jest.mock('@/lib/derivation/rederive', () => ({ rederiveMeetingsOfBody: jest.fn() }));

import { PUT } from '../route';
import { revalidateTag } from 'next/cache';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { editAdministrativeBody, editAdministrativeBodyContacts, getBodyPageRow } from '@/lib/db/administrativeBodies';

const mockIsCityAdmin = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockRequire = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockEditContacts = editAdministrativeBodyContacts as jest.MockedFunction<typeof editAdministrativeBodyContacts>;
const mockEditBody = editAdministrativeBody as jest.MockedFunction<typeof editAdministrativeBody>;
const mockGetBodyPageRow = getBodyPageRow as jest.MockedFunction<typeof getBodyPageRow>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const CITY = 'chania';
const BODY = 'youth';
const props = { params: Promise.resolve({ cityId: CITY, bodyId: BODY }) };
const CONTACTS = { youtubeChannelUrl: 'https://www.youtube.com/@youth', contactEmails: ['secretary@example.org'] };

function put(body: unknown) {
    return PUT({ json: async () => body } as unknown as NextRequest, props);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequire.mockResolvedValue(true);
    mockEditContacts.mockResolvedValue({ id: BODY } as never);
    mockEditBody.mockResolvedValue({ id: BODY, type: 'youthCouncil' } as never);
    mockGetBodyPageRow.mockResolvedValue({ id: BODY, type: 'youthCouncil' } as never);
});

describe('PUT /api/cities/{cityId}/administrative-bodies/{bodyId}', () => {
    it('writes the contacts for an admin of the body', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await put(CONTACTS);

        expect(res.status).toBe(200);
        expect(mockRequire).toHaveBeenCalledWith({ cityId: CITY, administrativeBodyId: BODY });
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, CONTACTS);
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('writes the contacts for an admin of the city when the payload holds the contacts alone', async () => {
        mockIsCityAdmin.mockResolvedValue(true);

        const res = await put(CONTACTS);

        expect(res.status).toBe(200);
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, CONTACTS);
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('passes the updates switch of a secondary body through the contacts write', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await put({ ...CONTACTS, notificationBehavior: 'NOTIFICATIONS_AUTO' });

        expect(res.status).toBe(200);
        expect(mockEditContacts).toHaveBeenCalledWith(BODY, { ...CONTACTS, notificationBehavior: 'NOTIFICATIONS_AUTO' });
        expect(mockEditBody).not.toHaveBeenCalled();
    });

    it('refuses an approval mode on the contacts write: nobody approves for a secondary body', async () => {
        mockIsCityAdmin.mockResolvedValue(false);

        const res = await put({ ...CONTACTS, notificationBehavior: 'NOTIFICATIONS_APPROVAL' });

        expect(res.status).toBe(400);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });

    it('keeps the full write for an admin of the city who sends the whole body', async () => {
        mockIsCityAdmin.mockResolvedValue(true);

        const res = await put({ name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' });

        expect(res.status).toBe(200);
        expect(mockEditBody).toHaveBeenCalledTimes(1);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });

    it('busts the lists that read the tier when the type of the body changes, and not otherwise', async () => {
        mockIsCityAdmin.mockResolvedValue(true);
        const whole = { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' };

        await put(whole);
        expect(mockRevalidateTag).not.toHaveBeenCalledWith('cities:all', 'max');

        mockGetBodyPageRow.mockResolvedValue({ id: BODY, type: 'committee' } as never);
        await put(whole);
        expect(mockRevalidateTag).toHaveBeenCalledWith(`city:${CITY}:meetings`, 'max');
        expect(mockRevalidateTag).toHaveBeenCalledWith('cities:all', 'max');
        expect(mockRevalidateTag).toHaveBeenCalledWith('realm:greece:landing-subjects', 'max');
    });

    it('answers 403 when the caller administers neither the body nor the city', async () => {
        mockIsCityAdmin.mockResolvedValue(false);
        const { ForbiddenError } = jest.requireActual('@/lib/api/errors');
        mockRequire.mockRejectedValue(new ForbiddenError('Not authorized'));

        const res = await put(CONTACTS);

        expect(res.status).toBe(403);
        expect(mockEditContacts).not.toHaveBeenCalled();
    });
});
