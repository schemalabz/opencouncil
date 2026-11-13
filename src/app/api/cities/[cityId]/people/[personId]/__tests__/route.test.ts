/** @jest-environment node */

jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock('@/lib/auth', () => ({
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    getRoleLimitForCity: jest.fn(),
    getCurrentUser: jest.fn().mockResolvedValue({ isSuperAdmin: true }),
}));
jest.mock('@/lib/db/people', () => ({ getPerson: jest.fn(), editPerson: jest.fn(), deletePerson: jest.fn() }));
jest.mock('@/lib/db/personRoles', () => ({ validatePersonRoles: jest.fn() }));
jest.mock('@/lib/s3', () => ({ uploadFile: jest.fn() }));
const order: string[] = [];
jest.mock('@/lib/db/voiceprintsDelete', () => ({
    deleteVoiceDataWithoutConsent: jest.fn(async () => { order.push('voice data'); return []; }),
}));

import { DELETE } from '@/app/api/cities/[cityId]/people/[personId]/route';
import { deletePerson } from '@/lib/db/people';
import { deleteVoiceDataWithoutConsent } from '@/lib/db/voiceprintsDelete';

describe('DELETE /api/cities/[cityId]/people/[personId]', () => {
    const remove = () => DELETE(
        new Request('http://localhost/api/cities/athens/people/p1', { method: 'DELETE' }),
        { params: Promise.resolve({ cityId: 'athens', personId: 'p1' }) },
    );

    beforeEach(() => {
        jest.clearAllMocks();
        order.length = 0;
        jest.mocked(deletePerson).mockImplementation(async () => { order.push('person'); });
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it("deletes the person, then the person's voice data, which the cascade leaves in the bucket", async () => {
        expect((await remove()).status).toBe(200);
        expect(deleteVoiceDataWithoutConsent).toHaveBeenCalledWith({ personId: 'p1' }, expect.any(String));
        expect(order).toEqual(['person', 'voice data']);
    });

    it('deletes no voice data when the person delete fails', async () => {
        jest.mocked(deletePerson).mockRejectedValueOnce(new Error('Failed to delete person'));
        expect((await remove()).status).toBe(500);
        expect(deleteVoiceDataWithoutConsent).not.toHaveBeenCalled();
    });
});
