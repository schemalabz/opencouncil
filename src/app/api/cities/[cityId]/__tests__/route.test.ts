/** @jest-environment node */

jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
}));
jest.mock('@/lib/db/cities', () => ({
    deleteCity: jest.fn(),
    editCity: jest.fn().mockResolvedValue({ id: 'athens' }),
    getCity: jest.fn(),
    updateCityGeometry: jest.fn(),
}));
jest.mock('@/lib/db/cityMessages', () => ({
    upsertCityMessage: jest.fn(),
    deleteCityMessage: jest.fn(),
}));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn().mockResolvedValue({ url: 'https://cdn.example.com/logo.png' }) }));

import { PUT } from '@/app/api/cities/[cityId]/route';
import { editCity } from '@/lib/db/cities';
import { deleteCityMessage, upsertCityMessage } from '@/lib/db/cityMessages';
import { uploadFile } from '@/lib/s3';

function put(fields: Record<string, string | File>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.append(key, value);
    return PUT(
        new Request('http://localhost/api/cities/athens', { method: 'PUT', body: formData }),
        { params: Promise.resolve({ cityId: 'athens' }) },
    );
}

// What CityForm sends for a superadmin with a message (CityForm.tsx).
const MESSAGE = {
    hasMessage: 'true',
    messageEmoji: '📢',
    messageTitle: 'Title',
    messageDescription: 'Description',
    messageCallToActionText: '',
    messageCallToActionUrl: '',
    messageCallToActionExternal: 'false',
    messageIsActive: 'true',
};

describe('PUT /api/cities/[cityId]', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads the message flags that CityForm sends', async () => {
        const response = await put({ name: 'Αθήνα', ...MESSAGE });
        expect(response.status).toBe(200);
        expect(upsertCityMessage).toHaveBeenCalledWith('athens', {
            emoji: '📢', title: 'Title', description: 'Description',
            callToActionText: null, callToActionUrl: null, callToActionExternal: false, isActive: true,
        });
    });

    it('deletes the message when hasMessage is false or absent', async () => {
        await put({ name: 'Αθήνα', hasMessage: 'false' });
        await put({ name: 'Αθήνα' });
        expect(deleteCityMessage).toHaveBeenCalledTimes(2);
        expect(upsertCityMessage).not.toHaveBeenCalled();
    });

    it('removes the logo on removeLogoImage=true', async () => {
        await put({ removeLogoImage: 'true' });
        expect(editCity).toHaveBeenCalledWith('athens', { logoImage: null });
        await put({});
        expect(editCity).toHaveBeenLastCalledWith('athens', {});
    });

    it('refuses a flag outside the stringbool lists before it writes', async () => {
        const response = await put({ ...MESSAGE, messageIsActive: 'maybe' });
        expect(response.status).toBe(400);
        expect(editCity).not.toHaveBeenCalled();
    });

    it('refuses a logo of another type with 400 and uploads nothing', async () => {
        const response = await put({ logoImage: new File(['x'], 'logo.gif', { type: 'image/gif' }) });
        expect(response.status).toBe(400);
        expect(JSON.stringify(await response.json())).toContain('Logo must be one of: image/png, image/jpeg');
        expect(uploadFile).not.toHaveBeenCalled();
        expect(editCity).not.toHaveBeenCalled();
    });

    it('uploads a PNG logo', async () => {
        const response = await put({ logoImage: new File(['x'], 'logo.png', { type: 'image/png' }) });
        expect(response.status).toBe(200);
        expect(editCity).toHaveBeenCalledWith('athens', { logoImage: 'https://cdn.example.com/logo.png' });
    });
});
