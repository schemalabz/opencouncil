/** @jest-environment node */
import type { NextRequest } from 'next/server';

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
    revalidateTag: jest.fn(),
}));
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn(),
    withUserAuthorizedToEdit: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({
    editAdministrativeBody: jest.fn(),
    editAdministrativeBodyContacts: jest.fn(),
    deleteAdministrativeBody: jest.fn(),
}));
jest.mock('@/lib/db/administrativeBodiesInternal', () => ({
    confirmDecisionConventions: jest.fn(),
}));
jest.mock('@/lib/derivation/rederive', () => ({
    rederiveMeetingsOfBody: jest.fn(),
}));

import { PUT } from '../route';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { editAdministrativeBody, editAdministrativeBodyContacts } from '@/lib/db/administrativeBodies';

const mockIsUserAuthorizedToEdit = isUserAuthorizedToEdit as jest.MockedFunction<typeof isUserAuthorizedToEdit>;
const mockWithUserAuthorizedToEdit = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockEdit = editAdministrativeBody as jest.MockedFunction<typeof editAdministrativeBody>;
const mockEditContacts = editAdministrativeBodyContacts as jest.MockedFunction<typeof editAdministrativeBodyContacts>;

const BODY = { name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council' };

function put(body: unknown) {
    const request = new Request('http://localhost/api/cities/zografou/administrative-bodies/b1', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    }) as unknown as NextRequest;
    return PUT(request, { params: Promise.resolve({ cityId: 'zografou', bodyId: 'b1' }) });
}

describe('PUT /api/cities/[cityId]/administrative-bodies/[bodyId]', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined as never);
        mockEdit.mockResolvedValue({ id: 'b1' } as never);
        mockEditContacts.mockResolvedValue({ id: 'b1' } as never);
    });

    // A body admin reaches the contacts path (#828), which carries the settings too (#874)
    it('lets an admin of the body replace its document send settings, and nothing else', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);
        const settings = [{ document: 'minutes', enabled: true, recipientEmails: ['minutes@example.org'] }];

        const response = await put({ name: 'Renamed', youtubeChannelUrl: '', documentSendSettings: settings });

        expect(response.status).toBe(200);
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou', administrativeBodyId: 'b1' });
        expect(mockEditContacts).toHaveBeenCalledWith('b1', { youtubeChannelUrl: null }, settings);
        expect(mockEdit).not.toHaveBeenCalled();
    });

    it('replaces the document send settings of the body', async () => {
        const settings = [
            { document: 'transcript', enabled: false, recipientEmails: [] },
            { document: 'minutes', enabled: true, recipientEmails: ['minutes@example.org'] },
        ];

        const response = await put({ ...BODY, documentSendSettings: settings });

        expect(response.status).toBe(200);
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'zografou' });
        expect(mockEdit).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'Δημοτικό Συμβούλιο' }), settings);
    });

    it('refuses a caller who edits neither the city nor the body before it writes', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);
        mockWithUserAuthorizedToEdit.mockRejectedValue(new Error('Not authorized'));

        const response = await put(BODY);

        expect(response.status).toBe(500);
        expect(mockEdit).not.toHaveBeenCalled();
        expect(mockEditContacts).not.toHaveBeenCalled();
    });

    it('rejects a recipient that is not an address', async () => {
        const response = await put({
            ...BODY,
            documentSendSettings: [{ document: 'minutes', enabled: true, recipientEmails: ['not-an-address'] }],
        });

        expect(response.status).toBe(400);
        expect(mockEdit).not.toHaveBeenCalled();
    });
});
