/** @jest-environment node */
const mockUpsert = jest.fn();
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { user: { upsert: (...a: unknown[]) => mockUpsert(...a) } } }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/auth/magicLink', () => ({ sendMagicLink: jest.fn() }));
jest.mock('@/lib/db/consultationComments', () => ({ COMMENT_MAX_LENGTH: 5000, createPendingConsultationComment: jest.fn(),
    fetchRegulationData: jest.fn(), publishConsultationComment: jest.fn(), regulationHasEntity: jest.fn() }));
import { submitPendingConsultationComment } from '../consultations';
it('refuses a comment from an address on the machine domain before any read or write', async () => {
    await expect(submitPendingConsultationComment({ consultationId: 'c1', cityId: 'athens', entityType: 'CHAPTER',
        entityId: 'ch1', text: 'Σχόλιο', name: 'Paola', email: 'Paola@machines.opencouncil.invalid' }))
        .rejects.toThrow('A valid email is required');
    expect(mockUpsert).not.toHaveBeenCalled();
});
