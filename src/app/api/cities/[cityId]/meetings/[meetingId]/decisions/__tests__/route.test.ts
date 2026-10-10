/** @jest-environment node */

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn(), withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/decisions', () => ({
    getDecisionsForMeeting: jest.fn(),
    getExtractedDataForMeeting: jest.fn(),
    upsertDecision: jest.fn().mockResolvedValue({ id: 'd1' }),
    deleteDecision: jest.fn(),
    clearExtractedDataForMeeting: jest.fn(),
    resetExtractionForSubject: jest.fn(),
}));
jest.mock('@/lib/db/decisionCandidates', () => ({}));
jest.mock('@/lib/derivation/persist', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, decision: { findUnique: jest.fn() } },
}));

import { PUT } from '../route';
import { upsertDecision } from '@/lib/db/decisions';

const put = (pdfUrl: string) => PUT(
    new Request('http://localhost/api/cities/athens/meetings/m1/decisions', {
        method: 'PUT',
        body: JSON.stringify({ subjectId: 's1', pdfUrl }),
    }),
    { params: Promise.resolve({ cityId: 'athens', meetingId: 'm1' }) },
);

describe('PUT decisions pdfUrl', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(['javascript:alert(1)', 'data:application/pdf;base64,AAAA', 'ftp://example.com/a.pdf', 'not a url'])(
        'refuses %s with 400', async (pdfUrl) => {
            const response = await put(pdfUrl);
            expect(response.status).toBe(400);
            expect(upsertDecision).not.toHaveBeenCalled();
        });

    it('takes a Diavgeia document URL', async () => {
        const response = await put('https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ');
        expect(response.status).toBe(200);
        expect(upsertDecision).toHaveBeenCalledWith(expect.objectContaining({ pdfUrl: 'https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ' }));
    });
});
